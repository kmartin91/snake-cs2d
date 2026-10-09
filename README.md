# Snake CS2D

Counter-Strike, mais t'es un serpent. Jeu navigateur en solo contre des bots ou en ligne entre potes.

## Le jeu

- **T** : amène la bombe sur le site A ou B et maintiens `E` pour la poser. **CT** : maintiens `E` collé à la bombe pour la désamorcer (le kit divise le temps par deux).
- Ta **longueur = ta vie et tes munitions** : chaque tir coûte un segment. Une balle coupe le serpent touché ; dans la tête c'est un headshot (sauf casque).
- Foncer dans un mur, un corps ennemi ou le tien = mort. Tête contre tête, le plus long gagne. Les coéquipiers sont traversables.
- Brouillard de guerre : tu ne vois qu'autour des serpents de ton équipe, les murs et les fumigènes bloquent la vue. Le serveur n'envoie pas les ennemis invisibles.
- Économie façon CS pendant le freeze time (`B`) : kevlar, HE, flash, smoke, chargeur étendu, kit.
- Déplacement lent et case par case comme un snake classique : rounds de 1:30, bombe 45 s, pose 3 s, désamorçage 10 s (5 s avec kit). Changement de camp à la mi-temps, premier à 5.

| Touche | Action |
| --- | --- |
| ZQSD / WASD / flèches | Diriger |
| Espace / clic | Tirer |
| Shift | Sprint |
| E (maintenu) | Poser / désamorcer |
| G · F · C | HE · Flash · Smoke |
| B puis 1-6 | Acheter |
| Tab · Entrée · M · Échap | Scores · Chat · Son · Pause |

Sur mobile : plein écran et paysage obligatoire, croix directionnelle à gauche, actions à droite, swipe sur la carte. Sur iPhone, « Sur l'écran d'accueil » lance le jeu en plein écran (manifeste PWA).

## Progression

- XP et rangs CS (Silver I → The Global Elite), sauvegardés dans le navigateur. Bonus d'XP en Hardcore (×1.4) et en ligne (×1.2).
- 11 skins de serpent à débloquer par niveau (Tigre, Néon, Asiimov, Fade, Dragon Lore, Arc-en-ciel…), visibles en ligne.
- 3 défis du jour, série de victoires avec bonus, récap d'XP en fin de match et bouton « Rejouer ».

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

- `public/shared/` : moteur de jeu partagé client/serveur (règles, armes, objectifs, bots, carte, vision).
- `public/js/` : rendu canvas, effets, sons synthétisés, HUD, menu, entrées, sessions locale/en ligne.
- `server.js`, `server/rooms.js` : serveur Express + Socket.IO, salles et tick à environ 6 Hz (170 ms par case).
