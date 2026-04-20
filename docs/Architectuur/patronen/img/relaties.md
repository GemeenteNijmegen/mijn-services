```mermaid
graph TB
    subgraph "Dienstverlenings patronen"
        Notificaties[📧 Notificaties]
        Taken[✅ Taken]
        Berichten[💬 Berichten]
        Verzoeken[📝 Verzoeken]
    end
        
    subgraph "Informatie patronen"
        Zaken[📁 Zaken, Documenten & Besluiten]
        Contactmomenten[📞 Contactmomenten]
        Profiel[👤 Profiel]
        Producten[🏪 Producten]
    end
    
    subgraph "Meta patronen"
        Publiceren[📰 Publiceren]
        Archiveren[🗄️ Archiveren]
        Klantbeeld[🔎 Klantbeeld]
    end


    classDef level5 fill:#4CAF50,stroke:#2E7D32,color:#fff
    classDef level3 fill:#FF9800,stroke:#E65100,color:#fff
    classDef level1 fill:#F44336,stroke:#C62828,color:#fff

    Verzoeken-->|Kan kleiden tot|Zaken
    Taken-->|Vereist|Notificaties 
    Berichten-->|Vereist|Notificaties 
    Notificaties-->|Vereist|Profiel

    Zaken-.->|"Kan met"|Notificaties
    Producten-.->|"Kan met"|Notificaties
    Notificaties-.->|"Registreert (optioneel)"|Contactmomenten

    Zaken-->|"Leid soms tot"|Publiceren
    Zaken-->|"Vereist"|Archiveren
```


## Met klantbeeld
```mermaid
graph TB
    subgraph "Dienstverlenings patronen"
        Notificaties[📧 Notificaties]
        Taken[✅ Taken]
        Berichten[💬 Berichten]
    end
        
    subgraph "Informatie patronen"
        Zaken[📁 Zaken, Documenten & Besluiten]
        Contactmomenten[📞 Contactmomenten]
        Profiel[👤 Profiel]
        Producten[🏪 Producten]
    end
    
    subgraph "Meta patronen"
        Publiceren[📰 Publiceren]
        Archiveren[🗄️ Archiveren]
        Klantbeeld[🔎 Klantbeeld]
    end


    classDef level5 fill:#4CAF50,stroke:#2E7D32,color:#fff
    classDef level3 fill:#FF9800,stroke:#E65100,color:#fff
    classDef level1 fill:#F44336,stroke:#C62828,color:#fff

    Taken-->|Vereist|Notificaties 
    Berichten-->|Vereist|Notificaties 
    Notificaties-->|Vereist|Profiel

    Zaken-.->|"Kan met"|Notificaties
    Producten-.->|"Kan met"|Notificaties
    Notificaties-.->|"Registreert (optioneel)"|Contactmomenten

    Zaken-->|"Leid soms tot"|Publiceren
    Zaken-->|"Vereist"|Archiveren


    Zaken-->|Onderdeel van|Klantbeeld
    Producten-->|Onderdeel van|Klantbeeld
    Contactmomenten-->|Onderdeel van|Klantbeeld
    Taken-->|Onderdeel van|Klantbeeld
    Berichten-->|Onderdeel van|Klantbeeld
    Profiel-->|Onderdeel van|Klantbeeld


```