# Zaakgericht Werken (ZGW) architectuur opties
We hebben in de eerste architectuur sessie 4 opties voor het gebruiken van ZGW APIs in de organisatie gevonden.


## 1. Centraal (een zaaksysteem)
```mermaid
graph LR
    %% Diagram 1 - Centraal
    subgraph Diagram1["1. Centraal zaaksysteem"]

        ZGW1[ZGW]
        TSA1_1[TSA1]
        TSA1_2[TSA2]
        
        TSA1_1 <--> ZGW1
        TSA1_2 <--> ZGW1
    end
```

### Opmerkingen
- Werkt misschien als utopie, realistisch gezien zal je altijd in een van de andere sitauties terechtkomen in de transiatie hiernaartoe.
- Voorkeur van aantal grote gemeenten (of sommige kleinen) - Er zijn mensen die dit een goed idee vinden die een lepel in de pap hebben.
- 10 jaren plan.

## 2. Elke TSA bepaald zelf
```mermaid
graph LR    
    %% Diagram 2 - Ieder voor zich
    subgraph Diagram2["2. Ieder voor zich"]
        ZGW2_1[ZGW1]
        ZGW2_2[ZGW2]
        ZGW2_3[ZGW3]
        TSA2_1[TSA]
        TSA2_2[TSA]
        TSA2_4[TSA2]
        TSA2_3[TSA1]
        
        TSA2_1  <--> ZGW2_1
        TSA2_2  <--> ZGW2_1
        TSA2_2  <--> ZGW2_2
        TSA2_3  <--> ZGW2_2
        TSA2_4  <--> ZGW2_3
    end
```

### Opmerkingen
- Hoe omsluiten we dit naar een beeld?

## 3. Centrale aggregatie
```mermaid
graph LR
    %% Diagram 3 - Centrale aggregator
    subgraph Diagram3["3. Centrale aggregator"]
        ZGW3_1[ZGW]
        ZGW3_2[ZGW2]
        ZGW3_3[ZGW3]
        AGG[Aggregator]
        TSA3_1[TSA]
        TSA3_2[TSA]
        TSA3_3[TSA]
        
        TSA3_1 <--> AGG
        TSA3_2 <--> AGG
        TSA3_3 <--> AGG
        AGG --> ZGW3_1
        AGG --> ZGW3_2
        AGG --> ZGW3_3
    end
```

### Opmerkingen
- Hoe gaan we om met aanmaken?

## 4. Duplicatie van data (een lees instantie)
```mermaid
graph LR
    %% Diagram 4 - Klonen
    subgraph Diagram4["4. Klonen"]
        ZGW4_1[ZGW]
        ZGW4_2[ZGW2]
        STUFF[STUFF]
        SQL[SQL]
        ZGW4_3["ZGW (duplicated)"]
        TSA4_1[TSA]
        TSA4_2[TSA]
        TSA4_3[TSA]
        TSA4_4["TSA (MijnNijmegen, KISS)"]
        TSA4_5[TSA]
        
        TSA4_1 --> ZGW4_1
        TSA4_2 --> ZGW4_2
        TSA4_3 --> STUFF
        TSA4_4 --> ZGW4_3
        TSA4_5 --> SQL

        ZGW4_1 --> ZGW4_3
        ZGW4_2 --> ZGW4_3
        STUFF --> ZGW4_3
        SQL --> ZGW4_3
    end
```