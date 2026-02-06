# Anime-Sama Watch Tracker

Extension Chrome/Brave pour suivre les épisodes regardés sur anime-sama, indépendamment des changements de domaine.

## Fonctionnalités

- **Suivi automatique** : Les épisodes sont marqués comme vus quand vous les sélectionnez
- **Panel visuel** : Grille d'épisodes avec progression sous le lecteur
- **Multi-saisons** : Gère plusieurs saisons et langues (VF, VOSTFR, etc.)
- **Badges catalogue** : Affiche la progression sur les pages catalogue
- **Sync multi-navigateurs** : Synchronisation via GitHub Gist entre vos navigateurs

## Installation

1. Téléchargez ou clonez ce repo
2. Ouvrez `chrome://extensions` (ou `brave://extensions`)
3. Activez le "Mode développeur"
4. Cliquez "Charger l'extension non empaquetée"
5. Sélectionnez le dossier de l'extension

## Synchronisation GitHub

Pour synchroniser vos données entre plusieurs navigateurs :

1. Ouvrez le popup de l'extension
2. Cliquez sur "GitHub Sync"
3. [Créez un token GitHub](https://github.com/settings/tokens/new?scopes=gist&description=Anime-Sama%20Tracker) avec le scope `gist`
4. Collez le token et cliquez "Synchroniser"

Le même token fonctionne sur tous vos navigateurs.

## Utilisation

- **Marquer un épisode** : Sélectionnez-le dans le dropdown ou cliquez sur le numéro dans le panel
- **Démarquer un épisode** : Clic droit sur le numéro dans le panel
- **Naviguer** : Cliquez sur le nom de l'anime ou de la saison dans le popup pour ouvrir la page au dernier épisode vu

## Structure des données

Les données sont stockées localement et optionnellement synchronisées via un Gist privé GitHub.

```json
{
  "nom-anime": {
    "name": "Nom Anime",
    "seasons": {
      "saison1/vostfr": {
        "watched": [1, 2, 3],
        "total": 12,
        "lastWatched": "2026-02-06",
        "lastEpisode": 3
      }
    }
  }
}
```

## Licence

MIT
