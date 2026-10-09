# Snake CS2D

Counter-Strike, mais t'es un serpent. Jeu navigateur en solo contre des bots ou en ligne entre potes.

## Le jeu

- **T** : amène la bombe sur le site A ou B et maintiens `E` pour la poser. **CT** : maintiens `E` collé à la bombe pour la désamorcer (le kit divise le temps par deux).
- Ta **longueur = ta vie et tes munitions** : chaque tir coûte un segment. Une balle coupe le serpent touché ; dans la tête c'est un headshot (sauf casque).
- Foncer dans un corps ennemi ou dans le tien = mort. Tête contre tête, le plus long gagne. Les murs te font glisser, les coéquipiers sont traversables.
- Économie façon CS pendant le freeze time (`B`) : kevlar, HE, flash, smoke, chargeur étendu, kit.
- Rounds courts (60 s, bombe 15 s), changement de camp à la mi-temps, premier à 5.

| Touche | Action |
| --- | --- |
| ZQSD / WASD / flèches | Diriger |
| Espace / clic | Tirer |
| Shift | Sprint |
| E (maintenu) | Poser / désamorcer |
| G · F · C | HE · Flash · Smoke |
| B puis 1-6 | Acheter |
| Tab · Entrée · M · Échap | Scores · Chat · Son · Pause |

Sur mobile : croix directionnelle, boutons d'action et swipe sur la carte.

## Modes

- **Solo vs bots** : tourne entièrement dans le navigateur (1v1 à 5v5, 3 niveaux de bots).
- **En ligne** : partie rapide (salle publique 4v4 complétée par des bots), salle privée avec code à 4 lettres et lien `?room=CODE`, liste des salles publiques, chat.

## Lancer

```bash
npm install
npm start
```

Puis [http://localhost:3000](http://localhost:3000). Le serveur sert la page et Socket.IO ; `render.yaml` permet de le déployer tel quel sur Render.

## Structure

- `public/shared/` : moteur de jeu partagé client/serveur (règles, armes, objectifs, bots, carte).
- `public/js/` : rendu canvas, effets, sons synthétisés, HUD, menu, entrées, sessions locale/en ligne.
- `server.js`, `server/rooms.js` : serveur Express + Socket.IO, salles et tick à 10 Hz.
