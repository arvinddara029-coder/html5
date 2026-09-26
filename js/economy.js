/* ============ SKYWARD — progression: level, XP, coins, gems, shop ============ */
(function () {
  const P = NR.profile;
  const E = (NR.economy = {});

  /* ---------- level curve ---------- */
  E.xpForLevel = function (level) {
    // XP required to go from `level` to `level+1`
    return 120 + (level - 1) * 90;
  };
  E.levelFromXp = function (xp) {
    let level = 1, need = E.xpForLevel(1), rest = xp;
    while (rest >= need && level < 99) { rest -= need; level++; need = E.xpForLevel(level); }
    return { level, into: rest, need };
  };
  E.applyXp = function (n, why) {
    P.xp = Math.max(0, Math.floor((P.xp || 0) + n));
    const before = P.level || 1;
    const now = E.levelFromXp(P.xp);
    P.level = now.level;
    if (now.level > before) {
      P.coins = (P.coins || 0) + (now.level - before) * 150; // level-up bonus
      E.pendingLevelUps = (E.pendingLevelUps || 0) + (now.level - before);
      NR.audio && NR.audio.play && NR.audio.play("ring");
    }
    if (why) E.lastGain = why;
    NR.saveProfile();
    return now;
  };
  E.addCoins = function (n) { P.coins = Math.max(0, Math.floor((P.coins || 0) + n)); NR.saveProfile(); };
  E.addGems = function (n) { P.gems = Math.max(0, Math.floor((P.gems || 0) + n)); NR.saveProfile(); };
  E.spend = function (coins, gems) {
    if ((P.coins || 0) < coins || (P.gems || 0) < gems) return false;
    P.coins -= coins; P.gems -= gems; NR.saveProfile();
    return true;
  };

  /* ---------- shop pricing ---------- */
  // Anything not listed is a free default.
  const PRICES = {
    // premium skins & monster skins
    "skin:Male Skin3": { coins: 400 }, "skin:Male Skin4": { coins: 600 }, "skin:Male Skin5": { gems: 15 },
    "skin:Female Skin2": { coins: 400 }, "skin:Female Skin3": { coins: 600 }, "skin:Female Skin4": { coins: 900 }, "skin:Female Skin5": { gems: 15 },
    "monster:Female Demon skin": { gems: 40 }, "monster:Female Devil skin": { gems: 40 },
    "monster:Female Ghost skin": { gems: 25 }, "monster:Female Orc skin": { coins: 2500 }, "monster:Female Zombie skin": { coins: 1800 },
    // hair
    "hair:Fancy Hair": { gems: 20 }, "hair:Male Hair11": { coins: 250 }, "hair:Male Hair12": { coins: 250 },
    "hair:Male Hair13": { coins: 350 }, "hair:Male Hair14": { coins: 350 }, "hair:Male Hair15": { coins: 500 },
    "hair:Male Hair16": { coins: 500 }, "hair:Male Hair17": { gems: 12 }, "hair:Male Hair18": { coins: 650 },
    "hair:Male Hair19": { coins: 650 }, "hair:Male Hair20": { gems: 18 }, "hair:Male Hair21": { coins: 800 },
    "hair:Male Hair22": { coins: 800 }, "hair:Male Hair23": { coins: 950 }, "hair:Male Hair24": { gems: 22 },
    "hair:Male Hair25": { coins: 1100 }, "hair:Male Hair26": { gems: 28 },
    "hair:Female Hair2": { coins: 250 }, "hair:Female Hair3": { coins: 350 }, "hair:Female Hair4": { gems: 12 }, "hair:Female Hair5": { gems: 18 },
    // ears
    "ears:mElven Ears2": { coins: 300 }, "ears:mElven Ears3": { coins: 450 }, "ears:mElven Ears4": { gems: 12 },
    "ears:mElven Ears5": { gems: 18 }, "ears:fElven Ears2": { coins: 300 }, "ears:fElven Ears3": { coins: 450 },
    "ears:fElven Ears4": { gems: 12 }, "ears:fElven Ears5": { gems: 18 },
    // hats
    "hat:mMale Hat2": { coins: 500 }, "hat:mMale Hat10": { gems: 15 }, "hat:mFarming Hat M": { coins: 700 },
    "hat:mGuard Helmet": { coins: 1200 }, "hat:mMale Blue cap": { coins: 300 }, "hat:mMale Green cap": { coins: 300 },
    "hat:fFemale Hat2": { coins: 400 }, "hat:fFemale Hat3": { coins: 500 }, "hat:fFemale Hat4": { gems: 15 }, "hat:fFemale Hat5": { gems: 20 },
    "hat:fBunny ears1": { coins: 600 }, "hat:fBunny ears2": { coins: 600 }, "hat:fBunny ears3": { coins: 750 },
    "hat:fBunny ears4": { gems: 18 }, "hat:fBunny ears5": { gems: 25 }, "hat:fFarming Hat F": { coins: 700 },
    "hat:fFemale Blue cap": { coins: 300 }, "hat:fFemale Green cap": { coins: 300 }, "hat:fFemale Orange cap": { coins: 350 },
    "hat:fFemale Purple cap": { coins: 350 }, "hat:fFemale Red cap": { coins: 350 }, "hat:fFemale Mining Helmet": { coins: 900 },
    "hat:fFemale Santa hat": { gems: 30 }, "hat:fWitch hat": { gems: 22 },
    // weapons
    "weapon:mBronze Sword": { coins: 200 }, "weapon:mIron Sword": { coins: 500 }, "weapon:mGolden Sword": { coins: 1200 },
    "weapon:mDiamond Sword": { gems: 30 }, "weapon:mBronze Axe": { coins: 350 }, "weapon:mIron Axe": { coins: 700 },
    "weapon:mGolden Axe": { coins: 1400 }, "weapon:mDiamond Axe": { gems: 35 }, "weapon:mWooden Pickaxe": { coins: 250 },
    "weapon:mIron Pickaxe": { coins: 800 }, "weapon:mGolden Pickaxe": { coins: 1500 }, "weapon:mDiamond Pickaxe": { gems: 35 },
    "weapon:fBronze Sword": { coins: 200 }, "weapon:fIron Sword": { coins: 500 }, "weapon:fGolden Sword": { coins: 1200 },
    "weapon:fDiamond Sword": { gems: 30 }, "weapon:fBronze Axe": { coins: 350 }, "weapon:fIron Axe": { coins: 700 },
    "weapon:fGolden Axe": { coins: 1400 }, "weapon:fDiamond Axe": { gems: 35 }, "weapon:fWooden Pickaxe": { coins: 250 },
    "weapon:fIron Pickaxe": { coins: 800 }, "weapon:fGolden Pickaxe": { coins: 1500 }, "weapon:fDiamond Pickaxe": { gems: 35 },
    "weapon:fBasket": { coins: 150 }, "weapon:fFlower": { coins: 150 },
    // gloves / back / masks / auras
    "gloves:mGlove blue": { coins: 250 }, "gloves:mGlove green": { coins: 250 }, "gloves:mGlove orange": { coins: 300 },
    "gloves:mGlove purple": { coins: 300 }, "gloves:mGlove red": { coins: 350 }, "gloves:mGlove white": { gems: 12 },
    "gloves:fOpera Gloves blue": { coins: 250 }, "gloves:fOpera Gloves brown": { coins: 250 }, "gloves:fOpera Gloves green": { coins: 300 },
    "gloves:fOpera Gloves orange": { coins: 300 }, "gloves:fOpera Gloves purple": { coins: 350 }, "gloves:fOpera Gloves red": { gems: 12 },
    "back:Backpack": { coins: 400 }, "back:Small Backpack": { coins: 250 }, "back:Cape blue": { coins: 600 },
    "back:Cape green": { coins: 600 }, "back:Cape orange": { coins: 600 }, "back:Cape purple": { coins: 700 },
    "back:Cape red": { gems: 20 }, "back:mMale Circle Shield": { coins: 1500 }, "back:fFemale Circle Shield": { coins: 1500 },
    "back:mMale Lantern": { coins: 900 }, "back:fFemale Lantern": { coins: 900 },
    "mask:mMale Plague Mask": { coins: 800 }, "mask:mMale Bandit Scarf": { coins: 500 },
    "mask:fFemale Plague Mask": { coins: 800 }, "mask:fFemale Blue Face paint": { gems: 15 },
    "aura:Character effects stars blue": { coins: 400 }, "aura:Character effects stars pink": { coins: 400 },
    "aura:Character effects stars teal": { coins: 500 }, "aura:Character effects hearts blue": { coins: 500 },
    "aura:Character effects hearts pink": { coins: 500 }, "aura:Character effects lines green": { coins: 400 },
    "aura:Character effects lines yellow": { coins: 400 }, "aura:Character effects buff blue": { coins: 600 },
    "aura:Character effects buff red": { coins: 600 }, "aura:Character effects debuff black": { coins: 600 },
    "aura:Character effects debuff gray brown": { coins: 600 }, "aura:Character effects curved blue": { coins: 550 },
    "aura:Character effects curved orange": { coins: 550 }, "aura:Character effects blood blue": { coins: 700 },
    "aura:Character effects blood green": { coins: 700 },
    // pets
    "pet:GandalfHardcore doggy sheet 2.png": { coins: 800 }, "pet:GandalfHardcore doggy sheet 3.png": { coins: 1000 },
    "pet:GandalfHardcore doggy sheet 4.png": { gems: 25 }, "pet:GandalfHardcore doggy sheet 5.png": { gems: 30 },
    "pet:GandalfHardcore fox.png": { gems: 20 }, "pet:GandalfHardcore Wisp.png": { gems: 45 },
    // outfits
    "top:mChainmail": { coins: 1200 },
    "top:fBlue Bodice": { coins: 300 }, "top:fGreen Bodice": { coins: 300 }, "top:fOrange Bodice": { coins: 300 },
    "top:fPurple Bodice": { coins: 300 }, "top:fBlue Bodice Long Sleeves": { coins: 500 }, "top:fGreen Bodice Long Sleeves": { coins: 500 },
    "top:fOrange Bodice Long Sleeves": { coins: 500 }, "top:fPurple Bodice Long Sleeves": { coins: 500 },
    "top:fCorset": { coins: 400 }, "top:fCorset Long Sleeves": { coins: 600 }, "top:fBlue Corset": { coins: 350 },
    "top:fGreen Corset": { coins: 350 }, "top:fOrange Corset": { coins: 350 }, "top:fPurple Corset": { coins: 350 },
    "top:fBlue Corset v2": { coins: 500 }, "top:fGreen Corset v2": { coins: 500 }, "top:fOrange Corset v2": { coins: 500 },
    "top:fPurple Corset v2": { coins: 500 }, "top:fArmored Corset": { gems: 30 },
    "bottom:mSplit hose": { coins: 400 }, "bottom:mBlue swim trunks": { coins: 150 }, "bottom:mGreen swim trunks": { coins: 150 },
    "bottom:mOrange swim trunks": { coins: 150 }, "bottom:mPurple swim trunks": { coins: 150 }, "bottom:mRed swim trunks": { coins: 150 },
    "bottom:fSkirt": { coins: 350 }, "bottom:fLong dress blue": { coins: 900 }, "bottom:fLong dress green": { coins: 900 },
    "bottom:fLong dress orange": { coins: 900 }, "bottom:fLong dress purple": { coins: 900 }, "bottom:fLong dress red": { gems: 25 },
    "bottom:fBlue dress": { coins: 600 }, "bottom:fFancy Blue Dress": { gems: 30 }, "bottom:fBlue bikini": { coins: 250 },
    "bottom:fGreen bikini": { coins: 250 }, "bottom:fOrange bikini": { coins: 250 }, "bottom:fPurple bikini": { coins: 250 },
    "underwear:mGreen Underwear": { coins: 100 }, "underwear:mOrange Underwear": { coins: 100 },
    "underwear:mPurple Underwear": { coins: 100 }, "underwear:mRed Underwear": { coins: 100 }, "underwear:mSkyblue Underwear": { coins: 100 },
    "underwear:fBlue Panties and Bra": { coins: 120 }, "underwear:fGreen Panties and Bra": { coins: 120 },
    "underwear:fOrange Panties and Bra": { coins: 120 }, "underwear:fPurple Panties and Bra": { coins: 120 },
    "underwear:fRed Panties and Bra": { coins: 120 }, "underwear:fSkyblue Panties and Bra": { coins: 120 },
    "shoes:fBlack Thigh-High Boots": { coins: 700 }, "shoes:fBrown Thigh-High Boots": { coins: 700 },
    "shoes:fPink Thigh-High Boots": { gems: 20 }, "shoes:fSocks": { coins: 100 }, "shoes:fGreen Socks": { coins: 120 },
    "shoes:fOrange Socks": { coins: 120 }, "shoes:fPurple Socks": { coins: 120 }, "shoes:fRed Socks": { coins: 120 },
    "shoes:fSkyblue Socks": { coins: 120 },
  };
  E.price = function (cat, id) {
    if (!id) return null;
    return PRICES[cat + ":" + id] || null;
  };
  E.owned = function (cat, id) {
    if (!id) return true;
    if (!E.price(cat, id)) return true;
    return !!(P.owned && P.owned[cat + ":" + id]);
  };
  E.buy = function (cat, id) {
    const price = E.price(cat, id);
    if (!price || E.owned(cat, id)) return false;
    if (!E.spend(price.coins || 0, price.gems || 0)) return false;
    P.owned = P.owned || {};
    P.owned[cat + ":" + id] = 1;
    NR.saveProfile();
    return true;
  };

  /* ---------- gameplay modifiers from level ---------- */
  E.levelBonus = function () {
    const lv = P.level || 1;
    return {
      hp: 1 + (lv - 1) * 0.05,      // +5% max HP per level
      damage: 1 + (lv - 1) * 0.03,  // +3% damage per level
    };
  };

  /* ---------- run rewards ---------- */
  E.awardRun = function (stats) {
    const coins = Math.floor((stats.score || 0) / 12) + (stats.kills || 0) * 4 + (stats.wave || 0) * 25;
    const xp = (stats.kills || 0) * 12 + Math.floor((stats.score || 0) / 90) + (stats.wave || 0) * 30;
    E.addCoins(coins);
    const before = P.level || 1;
    E.applyXp(xp);
    return { coins, xp, leveled: (P.level || 1) - before };
  };
})();
