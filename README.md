# CSnake

Snake × Counter-Strike, en ligne sur [csnake.kma.studio](https://csnake.kma.studio).

Snake + Counter-Strike : tu es un leader suivi par ton escouade en file. Plus elle est longue, plus tu cognes fort… et plus tu es une cible. Jeu navigateur, solo contre des bots ou en ligne entre potes.

## Le jeu

- Tu diriges le **leader** (la tête) qui **avance toujours**, comme dans le snake d'origine : au spawn il attend ta première direction, ensuite tu ne fais que l'orienter. L'escouade suit exactement ta trajectoire ; un demi-tour fait une petite boucle.
- **Toute l'escouade tire** vers ton viseur (avec une légère assistance sur les leaders ennemis) : chaque recrue ajoute de la puissance de feu, mais grossit la cible.
- Chaque soldat a ses PV et protège le leader. **Leader à terre = escouade décimée.**
- **Butin** : recrues, soins, armes (SMG, AK-47, pompe, AWP), grenades HE/flash/smoke. Les soldats tombés lâchent parfois leur plaque (recrue à récupérer).
- Tir plus précis en ligne droite qu'en plein virage. Brouillard de guerre : tu ne vois qu'autour de ton équipe, les ennemis proches s'entendent (échos rouges).

## Modes

- **Match à mort** : réapparition en 3 s, la première équipe à X kills (15/25/40) gagne. Un Deagle d'or apparaît au centre toutes les 40 s.
- **Course à l'armement** : chaque leader tué te donne l'arme suivante (Pistolet → SMG → Pompe → AK-47 → AWP → Deagle d'or, 2 kills par arme). Le premier à faire un kill au Deagle d'or gagne.
- **Classique** : rounds à une vie, les T posent la bombe sur A ou B (maintenir `E`, l'escouade s'arrête), les CT la désamorcent ; une balle interrompt l'action. Premier à 5 rounds, changement de camp à la mi-temps. Compte pour le **classement ELO**.

### Classement ELO

- En ligne : chaque match Classique met à jour la cote (K = 32, bots comptés à 1000). Le top 15 et ta cote sont dans l'onglet *En ligne*. L'identité est un jeton anonyme stocké dans le navigateur.
- En solo : cote locale contre les bots (Facile 800, Normal 1000, Hardcore 1250).
- Le serveur enregistre le classement dans `data/elo.json` (ou `ELO_FILE`) ; en production c'est un volume Docker, il survit aux redéploiements.

| Touche | Action |
| --- | --- |
| ZQSD / WASD / flèches | Déplacer le leader |
| Souris · clic / Espace | Viser · tirer |
| R | Recharger |
| E (maintenu) | Classique : poser / désamorcer |
| G · F · C | HE · Flash · Smoke vers le viseur |
| Tab · Entrée · M · Échap | Scores · Chat · Son · Pause |

Sur mobile : plein écran en paysage, joystick de déplacement à gauche, joystick de visée à droite (il tire tant qu'on le tient), bouton `E` en Classique.

- **Solo vs bots** : tourne entièrement dans le navigateur (1v1 à 5v5, 3 niveaux de bots).
- **En ligne** : partie rapide par mode, salle privée avec code à 4 lettres et lien `?room=CODE`, salles publiques, chat.
- **Progression** : XP et rangs CS, skins d'escouade à débloquer, défis du jour.

## Lancer

```bash
npm install
npm start
```

Puis [http://localhost:3000](http://localhost:3000).

## Déploiement (VPS)

Le jeu tourne dans un conteneur Docker isolé dans `/opt/csnake` sur le VPS, derrière Apache (`csnake.kma.studio` → `127.0.0.1:3210`, WebSocket compris).

- `deploy/setup-vps.sh` : installation initiale (dossiers, vhosts Apache dédiés, certificat Let's Encrypt). Le DNS `csnake.kma.studio` doit déjà pointer sur le VPS.
- `deploy/deploy.sh` : mise à jour (rsync du code puis `docker compose up -d --build`, vérifie `/health`).

L'hôte SSH se change avec `CSNAKE_HOST=user@ip`.

## Structure

- `public/shared/` : moteur partagé client/serveur (règles, physique, armes, butin, vision, bots, carte).
- `public/js/` : rendu canvas, effets, sons synthétisés, HUD, menu, entrées, progression, sessions locale/en ligne.
- `server.js`, `server/rooms.js` : serveur Express + Socket.IO, salles, tick à 20 Hz.
