# Plan: ECS Fargate op EC2 Capacity Providers (kostenoptimalisatie)

## Aanleiding

De huidige setup gebruikt ECS Fargate (serverless). Voor acceptance en development omgevingen
draaien veel containers continu, terwijl de workload laag en voorspelbaar is. Door over te
stappen op ECS met EC2 capacity providers (ook wel "Fargate on EC2" of ECS EC2 launch type
genoemd) kunnen de kosten aanzienlijk worden verlaagd.

> **Belangrijk onderscheid**: De containers en task definitions blijven ongewijzigd. Alleen het
> onderliggende compute platform verandert van Fargate (serverless vCPU/GB billing) naar EC2
> instances (uurtarief per instance).

---

## Huidige situatie: acceptance branch

### Actieve Fargate services (desiredCount: 1 per service)

| Service                         | Containers | CPU (vCPU)    | Memory (MB) |
|---------------------------------|------------|---------------|-------------|
| open-klant (main)               | 1          | 256           | 512         |
| open-klant (celery)             | 1          | 256           | 512         |
| open-notificaties (main)        | 1          | 256           | 512         |
| open-notificaties (celery)      | 1          | 256           | 512         |
| open-notificaties (celery-beat) | 1          | 256           | 512         |
| open-notificaties (rabbitmq)    | 1          | 256           | 512         |
| open-zaak (main)                | 1          | 256           | 512         |
| open-zaak (celery)              | 1          | 256           | 512         |
| objecttypes (main)              | 1          | 256           | 512         |
| objecttypes (celery)            | 1          | 256           | 512         |
| objects (main)                  | 1          | 1024          | 2048        |
| objects (celery)                | 1          | 256           | 512         |
| keycloak (main)                 | 1          | 512           | 1024        |
| gzac-backend (main)             | 1          | 512           | 1024        |
| gzac-rabbitmq                   | 1          | 256           | 512         |
| gzac-frontend                   | 1          | 256           | 512         |
| open-product (main)             | 1          | 256           | 512         |
| open-product (celery)           | 1          | 256           | 512         |
| omc (local-omc)                 | 1          | 256           | 512         |
| **Totaal**                      | **19**     | **~6.5 vCPU** | **~13 GB**  |

> Init/setup containers (setup-configuration tasks) draaien niet continu — alleen on-demand.
> RabbitMQ voor open-notificaties gebruikt ook een ephemeral volume, geen EFS.

### Overige infrastructuur (ongewijzigd)
- RDS Aurora PostgreSQL (gedeeld voor alle services)
- ElastiCache Redis (gedeeld voor alle Celery/cache backends)
- EFS filesystem (voor open-zaak media/private-media)
- ALB + CloudFront distributie
- API Gateway VPC Link

---

## Voorstel: EC2 Capacity Provider voor het ECS cluster

### Aanpak

Vervang de Fargate launch type in `EcsServiceFactory.createTaskDefinition` en
`EcsServiceFactory.createService` door EC2 launch type, en voeg een Auto Scaling Group (ASG)
toe als capacity provider aan het cluster.

De CDK wijzigingen zijn minimaal en geïsoleerd in `ContainerPlatform.ts` en
`EcsServiceFactory.ts`.

### Aanbevolen instance configuratie (acceptance)

**4x `t3.medium`** (2 vCPU, 4 GB RAM per instance)

| Aspect                    | Waarde                       |
|---------------------------|------------------------------|
| Totaal vCPU beschikbaar   | 8 vCPU                       |
| Totaal RAM beschikbaar    | 16 GB                        |
| Benodigde vCPU (workload) | ~6.5 vCPU                    |
| Benodigde RAM (workload)  | ~13 GB                       |
| Overhead ECS agent + OS   | ~0.2 vCPU / ~0.5 GB per node |
| Effectieve headroom       | ~0.7 vCPU / ~1 GB            |

#### Waarom 4 kleinere instances beter past dan 2 grotere

**Bin packing** — ECS verdeelt tasks over beschikbare nodes. Met 4 nodes zijn er meer
plaatsingsopties. De meeste tasks zijn 256 vCPU / 512 MB; een `t3.medium` past er ~5–6
comfortabel op. De zwaardere tasks (objects-main: 1 vCPU / 2 GB, keycloak/gzac: 512 / 1 GB)
krijgen elk hun eigen node zonder andere tasks te verdringen.

**Fault tolerance** — bij uitval of patching van 1 node verlies je 25% capaciteit (1 van 4)
in plaats van 50% (1 van 2). ECS kan de tasks van de uitgevallen node herplaatsen op de
resterende 3 nodes zonder dat de workload volledig stilvalt.

**Rolling updates** — met 4 nodes kan ECS 1 node draining zetten en nog steeds 75% van de
capaciteit beschikbaar houden. Met 2 nodes is dat slechts 50%, wat bij deze workload
dichtheid tot task evictions kan leiden.

**Juiste granulariteit** — de workload bestaat uit 19 kleine tasks. Grotere instances geven
meer capaciteit per node dan nodig is, waardoor je betaalt voor ongebruikte resources per
node. Kleinere instances sluiten beter aan bij de daadwerkelijke task-grootte.

> **Let op**: De objects-main task (1 vCPU / 2 GB) vult een `t3.medium` voor ~50%. Zet de
> ASG `maxCapacity` op 6 zodat er ruimte is als tijdelijk extra tasks draaien.

### Kostenvergelijking (eu-west-1, on-demand)

| Optie                                         | Kosten/maand (schatting) |
|-----------------------------------------------|--------------------------|
| Huidige Fargate (19 tasks, ~6.5 vCPU / 13 GB) | ~€ 180–220               |
| 4x t3.medium On-Demand                        | ~€ 120                   |
| 4x t3.medium Reserved (1jr)                   | ~€ 75                    |
| 2x t3.xlarge On-Demand (minder geschikt)      | ~€ 120                   |

> Fargate prijs: vCPU €0.04048/uur + GB €0.004445/uur. EC2 t3.xlarge: ~€0.1664/uur.
> Gebruik de [AWS Pricing Calculator](https://calculator.aws) voor exacte cijfers.

---

## Benodigde CDK wijzigingen

### 1. `ContainerPlatform.ts` — voeg ASG capacity provider toe

```typescript
import { AutoScalingGroup } from 'aws-cdk-lib/aws-autoscaling';
import { AsgCapacityProvider, Cluster } from 'aws-cdk-lib/aws-ecs';
import { InstanceType, InstanceClass, InstanceSize, MachineImage } from 'aws-cdk-lib/aws-ec2';

// In de constructor, vervang:
this.cluster = new Cluster(this, 'cluster', { vpc: props.vpc });

// Door:
this.cluster = new Cluster(this, 'cluster', { vpc: props.vpc });

const asg = new AutoScalingGroup(this, 'asg', {
  vpc: props.vpc,
  instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MEDIUM),
  machineImage: EcsOptimizedImage.amazonLinux2(),
  minCapacity: 4,
  maxCapacity: 6,
  desiredCapacity: 4,
});

const capacityProvider = new AsgCapacityProvider(this, 'capacity-provider', {
  autoScalingGroup: asg,
  enableManagedTerminationProtection: false,
});

this.cluster.addAsgCapacityProvider(capacityProvider);
```

### 2. `EcsServiceFactory.ts` — wijzig task definition en service naar EC2

```typescript
import { Compatibility, Ec2Service } from 'aws-cdk-lib/aws-ecs';

// createTaskDefinition: vervang Compatibility.FARGATE door Compatibility.EC2
const task = new TaskDefinition(this.scope, `${id}-task`, {
  cpu: options?.cpu ?? '256',
  memoryMiB: options?.memoryMiB ?? '512',
  compatibility: Compatibility.EC2,  // was: Compatibility.FARGATE
  ...options,
});

// createService: vervang FargateService door Ec2Service
const service = new Ec2Service(this.scope, `${options.id}-service`, {
  cluster: this.props.cluster,
  taskDefinition: options.task,
  cloudMapOptions: cloudmap,
  ...options.options,
});
```

> **Let op**: `Ec2Service` heeft geen `networkMode: awsvpc` vereiste zoals Fargate. Controleer
> of de CloudMap SRV records en VPC Link security group rules nog correct werken — bij EC2
> bridge networking werken poort-mappings anders dan bij awsvpc mode.
>
> **Aanbeveling**: Gebruik `networkMode: AwsVpcNetworkMode` ook bij EC2 launch type om de
> bestaande security group logica en CloudMap SRV records intact te houden. Dit vereist dat de
> EC2 instances voldoende ENIs ondersteunen (t3.xlarge: max 15 ENIs).

### 3. `Configuration.ts` — optioneel: voeg `launchType` veld toe aan configuratie

Zo kan per omgeving worden gekozen tussen Fargate (prod) en EC2 (accp/dev):

```typescript
// In ConfigurationInterfaces.ts
export interface Configuration {
  // ...
  containerLaunchType?: 'FARGATE' | 'EC2';
}

// acceptance:
containerLaunchType: 'EC2',

// main (prod):
containerLaunchType: 'FARGATE', // of weglaten als default
```

---

## Overwegingen en risico's

| Punt                | Toelichting                                                                                                                                                        |
|---------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| EFS compatibiliteit | EFS mounts werken ook bij EC2 launch type, geen wijziging nodig                                                                                                    |
| awsvpc network mode | Behoud awsvpc voor consistentie met bestaande security groups en CloudMap                                                                                          |
| Spot instances      | t3.medium Spot kan ~70% goedkoper zijn, maar risico op interruption — niet aanbevolen voor acceptance                                                              |
| Patching            | Met 4 instances kan 1 node worden gedraint terwijl 75% capaciteit beschikbaar blijft                                                                               |
| Scaling             | ASG maxCapacity=6 geeft ruimte als tijdelijk meer containers nodig zijn                                                                                            |
| ENI limiet          | t3.medium ondersteunt max 3 ENIs; bij awsvpc mode is dat 1 ENI per task. Met ~5 tasks per node is dit een harde limiet — houd hier rekening mee bij task placement |
| Prod omgeving       | Prod blijft op Fargate voor maximale beschikbaarheid en geen capacity management                                                                                   |

---

## Implementatiestappen

1. Voeg `containerLaunchType` toe aan `ConfigurationInterfaces.ts`
2. Pas `ContainerPlatform.ts` aan: conditioneel ASG + capacity provider aanmaken
3. Pas `EcsServiceFactory.ts` aan: conditioneel `Ec2Service` vs `FargateService` en `Compatibility.EC2` vs `Compatibility.FARGATE`
4. Zet `containerLaunchType: 'EC2'` in de acceptance configuratie
5. Deploy naar acceptance en valideer alle services
6. Monitor kosten via Cost Explorer na 1 week

---

## Conclusie

Door 4x `t3.medium` EC2 instances als capacity provider te gebruiken voor het acceptance ECS
cluster, dalen de compute kosten van ~€200/maand naar ~€120/maand on-demand, of ~€75/maand
met Reserved Instances. Ten opzichte van 2 grotere instances biedt deze configuratie betere
fault tolerance (25% vs 50% capaciteitsverlies bij uitval), betere bin packing voor de mix
van kleine tasks, en meer granulariteit bij rolling updates. De CDK wijzigingen zijn minimaal
en geïsoleerd — containers, task definitions, secrets, databases en netwerkconfiguratie
blijven volledig ongewijzigd.

> **ENI limiet aandachtspunt**: `t3.medium` heeft een maximum van 3 ENIs. Bij `awsvpc`
> network mode verbruikt elke task 1 ENI. Overweeg `t3.large` (max 3 ENIs, maar hogere
> instance-level limiet via trunk networking) of schakel ECS managed networking in als de
> ENI limiet een bottleneck wordt.
