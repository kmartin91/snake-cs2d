# Snake Strike

Snake + Counter-Strike : tu es un leader suivi par ton escouade en file. Plus elle est longue, plus tu cognes fort… et plus tu es une cible. Jeu navigateur, solo contre des bots ou en ligne entre potes.

## Le jeu (prototype : match à mort par équipes)

- Tu diriges le **leader** (la tête) qui **avance toujours**, comme dans le snake d'origine : au spawn il attend ta première direction, ensuite tu ne fais que l'orienter. L'escouade suit exactement ta trajectoire ; un demi-tour fait une petite boucle.
- **Toute l'escouade tire** vers ton viseur : chaque recrue ajoute de la puissance de feu, mais grossit la cible.
- Chaque soldat a ses PV et protège le leader. **Leader à terre = escouade décimée** → réapparition 3 s plus tard.
- **Butin** : recrues, soins, armes (SMG, AK-47, pompe, AWP), grenades HE/flash/smoke. Les soldats tombés lâchent parfois leur plaque (recrue à récupérer). Toutes les 40 s, un **Deagle d'or** apparaît au centre.
- Tir plus précis en ligne droite qu'en plein virage. Brouillard de guerre : tu ne vois qu'autour de ton équipe, les ennemis proches s'entendent (échos rouges).
- Match de 4 minutes ou premier à 25 kills (réglable en solo).

| Touche | Action |
| --- | --- |
| ZQSD / WASD / flèches | Déplacer le leader |
| Souris · clic / Espace | Viser · tirer |
| R | Recharger |
| G · F · C | HE · Flash · Smoke vers le viseur |
| Tab · Entrée · M · Échap | Scores · Chat · Son · Pause |

Sur mobile : plein écran en paysage, joystick de déplacement à gauche, joystick de visée à droite (il tire tant qu'on le tient).

## Modes

- **Solo vs bots** : tourne entièrement dans le navigateur (1v1 à 5v5, 3 niveaux de bots).
- **En ligne** : partie rapide, salle privée avec code à 4 lettres et lien `?room=CODE`, salles publiques, chat.
- **Progression** : XP et rangs CS, skins d'escouade à débloquer, défis du jour.

## Lancer

```bash
npm install
npm start
```

Puis [http://localhost:3000](http://localhost:3000). `render.yaml` permet de déployer tel quel sur Render.

## Structure

- `public/shared/` : moteur partagé client/serveur (règles, physique, armes, butin, vision, bots, carte).
- `public/js/` : rendu canvas, effets, sons synthétisés, HUD, menu, entrées, progression, sessions locale/en ligne.
- `server.js`, `server/rooms.js` : serveur Express + Socket.IO, salles, tick à 20 Hz.
