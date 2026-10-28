---
name: cantoria-design-decision
description: "Charger cette skill pour trancher une question d'architecture ou d'ergonomie Cantoria (où place un réglage, quelle option retenir) en s'appuyant sur le code existant et les principes de VISION.md, puis proposer l'implémentation."
---

# Trancher une question d'architecture UX

## Méthode (validée sur « menu global vs menus par page », PR #35)

1. **Lire le code avant de répondre.** La réponse est souvent déjà en germe
   dans l'app : avant de recommander quoi que ce soit, `grep` les mécanismes
   voisins (ex. : `cardFields` pour la question des badges d'accords) et
   liste les patterns déjà établis. Une décision cohérente avec l'existant
   coûte moins cher qu'une décision « idéale » isolée.
2. **Confronter aux principes de VISION.md, dans l'ordre.** « Sobre »,
   « lisible à distance, utilisable sans toucher l'écran », « hors ligne
   d'abord » départagent la plupart des arbitrages. Une option qui
   complique l'usage en concert est disqualifiée d'office.
3. **Distinguer configuration et moment d'usage.** Ce qui se règle rarement,
   réfléchi → paramètres globaux. Ce qui s'ajuste en pleine répétition →
   contrôle direct dans le lecteur. Le décompte, la taille du texte et la
   visibilité des accords suivent tous « défaut global + ajustement local ».
4. **Un réglage = un seul endroit où on le change.** Jamais deux panneaux
   qui pilotent la même chose : ils divergent, et l'utilisateur ne sait
   plus où chercher. Un second menu de réglages propre au lecteur est un
   anti-pattern ici.
5. **Ne pas fusionner des options voisines mais distinctes.** Exemple réel :
   le badge « N accords » des cartes (`cardFields.chords`, bibliothèque) et
   la liste des accords du lecteur (`chordsVisible`) sont deux réglages
   séparés ; les fusionner créerait une dépendance artificielle.
6. **Penser à la cible tactile à venir** (Android/ChromeOS,
   `docs/android-chromeos.md`) : un contrôle dans le lecteur survit au
   tactile, un raccourci clavier non ; un menu en plus est un coût.

## Formaliser la réponse

- Structure : **décision recommandée → principes qui la fondent → application
  concrète → ce qu'il faut éviter**. Le superviseur doit pouvoir trancher
  en lisant le raisonnement, pas seulement la conclusion.
- Si la décision touche au périmètre ou contredit VISION.md (ex. piste
  mobile), **ne pas trancher seul** : présenter les options et les
  conséquences, et laisser la décision écrite au superviseur (VISION.md :
  « Questions ouvertes — ne pas trancher seul »).
- Terminer par la proposition d'implémentation (et la référencer vers la
  skill `cantoria-ui-feature` si c'est une préférence/commande d'interface).
