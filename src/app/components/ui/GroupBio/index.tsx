"use client";

import { useState } from "react";
import { sanitizeText } from "@/app/utils/sanitize";
import styles from "./GroupBio.module.scss";

const logos = {
  '2010-03-10': '/logos/2010.png',
  '2011-09-10': '/logos/2011.png',
  '2015-01-01': '/logos/2015.png',
}

const forts = {
  '2010-03-10': '/forts/solstice.png',
  '2011-09-25': '/forts/topixa.jpg',
}

const owners = {
  '2010-03-10': 'Soccerpr89',
  '2010-03-22': 'Trick555',
  '2010-03-26': 'SoccerKing89',
  '2010-05-04': 'Soccerpr89 (2nd term)',
  '2010-05-07': 'Vince13579',
  '2010-07-01': 'Soccerpr89 (3rd term)',
  '2010-09-28': 'BuildXbuild',
  '2010-12-05': 'Soccerpr89 (4th term)',
  '2011-03-05': 'Darxia',
  '2011-08-08': 'XNoBoomX',
  '2011-09-24': 'Fighters1234',
  '2012-11-02': 'Bob104810',
  '2013-06-28': 'Fireantfive',
  '2014-08-06': 'BelmontLegend255',
  '2014-12-31': 'AustinLink',
  '2015-02-11': 'Ezaiahs',
  '2017-01-06': 'Thelegender',
  '2017-01-14': 'NoAlias',
}

const members = {
  '2010-03-06': 0,
  '2010-03-08': 100,
  '2010-03-21': 631,
  '2010-03-31': 951,
  '2010-05-19': 1470,
  '2010-05-25': 1335,
  '2010-06-14': 1558,
  '2010-08-02': 1607,
  '2010-08-22': 2012,
  '2010-12-14': 1900,
  '2010-12-23': 2010,
  '2011-01-01': 2160,
  '2011-01-03': 4468,
}

const descriptions = {
  '2010-03-10': 'Unknown',

  '2010-04-11': `
  "Fight for freedom, live for justice!" Join the NFC today! We are a powerful modern military clan and we fight with our allies for peace, freedom, and justice throughout all of ROBLOXia. ================================= Uniform [Shirt]: http://www.roblox.com/Nightfall-Clan-Uniform-item?id=25259205 ================================= Uniform [Pants]:http://www.roblox.com/Nightfall-Clan-Uniform-Pants-item?id=22895686 ================================= Head Quarters: http://www.roblox.com/Nightfall-Clan-Official-HQ-item?id=2627273 ================================= Promotion Information: http://www.roblox.com/Forum/ShowPost.aspx?PostID=23986257 ================================ Enemies: REF ================================ Allies: RAT, UCR, Frost Clan, Burn Clan, RoXzon, United VroX, M INC, ES, RAD, CRO, and many other smaller clans. ================================= Neutral: FEAR, X-101st
  `,

  '2010-06-26': `
  "Fight for freedom, live for justice!" Join the NFC today! We are a powerful modern military clan and we fight with our allies for peace, freedom, and justice throughout all of ROBLOXia. ================================= Uniform [Shirt]: http://www.roblox.com/Nightfall-Clan-Uniform-item?id=25259205 ================================= Uniform [Pants]: http://www.roblox.com/Nightfall-Clan-Official-Uniform-Pants-item?id=27718770 ================================= Head Quarters: http://www.roblox.com/Nightfall-Clan-Official-HQ-item?id=2627273 ================================= Promotion Information: http://www.roblox.com/Forum/ShowPost.aspx?PostID=24741986 ================================ Enemies: REF, FEAR, DC, NFC2, x-101st ================================ Allies: RAI, RAT, REG, Burn Clan, RoXzon, United VroX, M INC, ES, RAD, UNSC, CRO, LCR, Frost Clan, SCAR, DFC, BOMB, Fire Clan and many other smaller clans. ================================= Neutral: None
  `,

  '2010-07-29': `
  "Fight for freedom, live for justice!" NFC is a powerful modern military clan. Join today! ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Allies: FEAR, UCR, Frost Clan, X-101st, LCR, RFA, Sleet Clan, ESS, REF, and many other clans. ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Enemies: John's Cobras ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Defeated Clans: RAT, Burn Clan, ACF ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Head Quarters: http://www.roblox.com/Nightfall-Clan-Head-Quarters-item?id=12150941 ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Uniform [Shirt]: http://www.roblox.com/NFC-Uniform-Shirt-item?id=29903982 ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Uniform [Pants]: http://www.roblox.com/NFC-Uniform-Pants-item?id=23073007 ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Want to get promoted? Read how here! http://www.roblox.com/Forum/ShowPost.aspx?PostID=30141933 ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Clan Rules: http://www.roblox.com/Forum/ShowPost.aspx?PostID=30216354
  `,

  '2010-11-23': `
  "Fight for freedom, live for justice!" NFC is one of the strongest armies on ROBLOX! Join today! ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Allies: FEAR, RAT, UCR, F.E.A.R, Frost Clan, Sleet Clan, RFA, NB, LCR, RFF, SCR ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Enemies: The X-101st Legion (NFC-4, X-101st-1) ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Defeated Clans: John's Cobras, Vampire Knights, Burn Clan, T2M ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Recruitment Center: http://www.roblox.com/Nightfall-Clan-Recruitment-Center-item?id=32335481 ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Uniform [Shirt] http://www.roblox.com/NFC-Uniform-shirt-item?id=35928597 ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Uniform [Pants] http://www.roblox.com/NFC-Uniform-pants-item?id=36109875 ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Want to get promoted? Read how here! http://www.roblox.com/Forum/ShowPost.aspx?PostID=31456745
  `,

  '2011-11-04': `
  Join today. Live tomorrow!
  [5,000+ MEMBERS]
  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
  Guide: http://www.roblox.com/Forum/ShowPost.aspx?PostID=56725923
  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
  Defend this place!:  http://www.roblox.com/Nightfall-Clan-Fort-Topixa-RAID-place?id=53679379
  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
  Uniform Shirt-
  http://www.roblox.com/OFFICIAL-NFC-Uniform-Shirt-item?id=64957460
  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
  Uniform Pants-
  http://www.roblox.com/OFFICIAL-NFC-Uniform-Pants-item?id=64957605
  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
  [Wars Won]- TF, SC, LCR, SCR, NFA, UCR, CE, 1MC, BAM, RD, ART, VK, RAT.
  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
  [Raid Scores]- NFC:14 RoC:5, NFC: 12 UCR: 8, NFC:11 RSF:5, NFC: 2 APN: 1, NFC: 4 IL: 1
  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
  [NEWS]- Friendly War with RSF, IL and UCR. Hardcore war with RoC and CE.
  `,

  '2010-11-10': `
  Join today. Live tomorrow!
  [5,000+ MEMBERS]
  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
  Guide: http://www.roblox.com/Forum/ShowPost.aspx?PostID=56725923
  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
  Defend this place!:  http://www.roblox.com/Nightfall-Clan-Fort-Topixa-RAID-place?id=53679379
  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
  Uniform Shirt-
  http://www.roblox.com/OFFICIAL-NFC-Uniform-Shirt-item?id=64957460
  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
  Uniform Pants-
  http://www.roblox.com/OFFICIAL-NFC-Uniform-Pants-item?id=64957605
  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
  [Wars Won]- TF, SC, LCR, SCR, NFA, UCR, CE, 1MC ,BAM, RD, ART, VK, RAT.
  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
  [Raid Scores]- NFC:14 RoC:5, NFC:12 RSF:5, NFC: 4 APN: 4, NFC: 7 IL: 2
  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
  [NEWS]- Friendly War with RSF, IL and UCR. Hardcore war with RoC and CE.
  `,



}

const ranks = {
  '2010-03-10': ['Warrior', 'Apprentice', 'Knight', 'Dark Paladin', 'Master', 'Senator', 'Council Member', 'Vice Chancellor', 'Chancellor'],
  '2010-06-26': ['Warrior', 'Apprentice', 'Knight', 'Dark Paladin', 'Professional', 'Master', 'Council Member', 'Vice Chancellor', 'Chancellor'],
  '2010-07-29': ['Warrior', 'Apprentice', 'Knight', 'Dark Paladin', 'Master', 'Senator', 'Council Member', 'Vice Chancellor', 'Chancellor' ],
  '2010-11-23': ['Warrior', 'Apprentice', 'Knight', 'Dark Paladin', 'Master', 'Senator', 'Council Member', 'Council Leader', 'Chancellor'],
  '2011-11-04': ['Warrior', 'Guard', 'Knight', 'Crusader', 'Dark Paladin', 'Warlord', 'Grand', 'Council', 'Chancellor']
}

export default function GroupBio() {
  const [currentLogo, setCurrentLogo] = useState(logos['2010-03-10']);
  const [currentFort, setCurrentFort] = useState(forts['2010-03-10']);
  const [currentOwner, setCurrentOwner] = useState(owners['2010-03-10']);
  const [currentMembers, setCurrentMembers] = useState(members['2010-03-06']);
  const [currentDescription, setCurrentDescription] = useState(descriptions['2010-04-11']);

  return (
    <aside className={styles.component}>
      <div className={styles.header}>
        <img className={styles.fort} src={currentFort} />
        <img className={styles.logo} src={currentLogo} />

        <div className={styles.details}>
          <div className={styles.detail}>
            <span className={styles.label}>Owner</span>
            <span className={styles.value}>{currentOwner}</span>
          </div>

          <div className={styles.detail}>
            <span className={styles.label}>Members</span>
            <span className={styles.value}>{currentMembers.toLocaleString()}</span>
          </div>
        </div>

      </div>
      <p className={styles.description} dangerouslySetInnerHTML={{ __html: sanitizeText(currentDescription) }} />
    </aside>
  );
}
