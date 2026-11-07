/**
 * Robust number parsing utility for Hindi, Marathi, and Hinglish.
 * Accurately parses standard numbers, compound phrases (e.g. "एक हजार छह सौ" = 1600),
 * colloquial multiples (e.g. "सोलह सौ" = 1600, "पंधराशे" = 1500, "पाचशे" = 500),
 * and Devanagari/Arabic digits with punctuation.
 */

export interface NumberParseResult {
  amount: number;
  matchedText: string;
  confidence: number;
  isWordBased: boolean;
}

// Devanagari to ASCII digit mapping
const DEVANAGARI_DIGITS: Record<string, string> = {
  "०": "0", "१": "1", "२": "2", "३": "3", "४": "4",
  "५": "5", "६": "6", "७": "7", "८": "8", "९": "9",
};

export function normalizeDevanagariDigits(text: string): string {
  return text.replace(/[०-९]/g, (d) => DEVANAGARI_DIGITS[d] || d);
}

// Base units and numbers (1 - 99) in Hindi, Marathi, and Hinglish
const NUMBER_WORDS: Record<string, number> = {
  // 1-10
  ek: 1, एक: 1, 
  do: 2, doh: 2, don: 2, दो: 2, दोन: 2,
  teen: 3, tin: 3, तीन: 3,
  chaar: 4, char: 4, चार: 4,
  paanch: 5, panch: 5, paach: 5, पांच: 5, पाच: 5,
  chheh: 6, chhah: 6, chhe: 6, saha: 6, छह: 6, छः: 6, सहा: 6,
  saat: 7, sat: 7, सात: 7,
  aath: 8, ath: 8, आठ: 8,
  nau: 9, nav: 9, nauv: 9, नौ: 9, नऊ: 9,
  das: 10, daha: 10, दस: 10, दहा: 10,

  // 11-20
  gyaarah: 11, gyarah: 11, akara: 11, ग्यारह: 11, अकरा: 11,
  baarah: 12, barah: 12, bara: 12, बारह: 12, बारा: 12,
  terah: 13, tera: 13, तेरह: 13, तेरा: 13,
  chaudah: 14, chauda: 14, चौदह: 14, चौदा: 14,
  pandrah: 15, pandra: 15, pandhra: 15, पंद्रह: 15, पंधरा: 15,
  solah: 16, sola: 16, solaa: 16, सोलह: 16, सोळा: 16,
  satrah: 17, satra: 17, सत्रह: 17, सतरा: 17,
  athaarah: 18, atharah: 18, athra: 18, अठारह: 18, अठरा: 18,
  unnees: 19, unnis: 19, ekonis: 19, उन्नीस: 19, एकोणीस: 19,
  bees: 20, bis: 20, vees: 20, vis: 20, बीस: 20, वीस: 20,

  // 21-30
  ikkees: 21, ikkis: 21, ekvis: 21, इक्कीस: 21, एकवीस: 21,
  baees: 22, bais: 22, bavis: 22, बाईस: 22, बावीस: 22,
  teees: 23, teis: 23, tevis: 23, तेईस: 23, तेवीस: 23,
  chaubees: 24, chaubis: 24, chovis: 24, चौबीस: 24, चोवीस: 24,
  pachchees: 25, pachis: 25, pachees: 25, panchvis: 25, पच्चीस: 25, पंचवीस: 25,
  chhabbees: 26, chhabbis: 26, savvis: 26, छब्बीस: 26, सव्वीस: 26,
  sattaees: 27, sattais: 27, sattavis: 27, सत्ताईस: 27, सत्तावीस: 27,
  atthaees: 28, atthais: 28, atthavis: 28, अट्ठाईस: 28, अठ्ठावीस: 28,
  unatees: 29, unatis: 29, ekontis: 29, उनतीस: 29, एककोणतीस: 29,
  tees: 30, tis: 30, तीस: 30,

  // 31-40
  iktees: 31, iktis: 31, ektis: 31, इकतीस: 31, एकतीस: 31,
  battees: 32, battis: 32, बत्तीस: 32,
  taintees: 33, taintis: 33, tehtis: 33, तैंतीस: 33, तेहतीस: 33,
  chauntees: 34, chauntis: 34, chautis: 34, चौंतीस: 34, चवतीस: 34,
  paintees: 35, paintis: 35, pastis: 35, पैंतीस: 35, पस्तीस: 35,
  chhattees: 36, chhattis: 36, छत्तीस: 36,
  saintees: 37, saintis: 37, sadtis: 37, सैंतीस: 37, सदतीस: 37,
  adtees: 38, adtis: 38, अड़तीस: 38, अडतीस: 38,
  untalees: 39, untalis: 39, ekonchalis: 39, उनतालीस: 39, एकोणचाळीस: 39,
  chaalees: 40, chalis: 40, chalees: 40, चालीस: 40, चाळीस: 40,

  // 41-50
  iktalis: 41, ekchalis: 41, इकतालीस: 41, एकचाळीस: 41,
  bayalis: 42, bechalis: 42, बयालीस: 42, बेचाळीस: 42,
  taintalis: 43, trechalis: 43, तैंतालीस: 43, त्रेचाळीस: 43,
  chawalis: 44, chavvechalis: 44, चवालीस: 44, चव्वेचाळीस: 44,
  paintalis: 45, panchechalis: 45, पैंतालीस: 45, पंचेचाळीस: 45,
  chhiyalis: 46, shechalis: 46, छियालीस: 46, शेचाळीस: 46,
  saintalis: 47, sattechalis: 47, सैंतालीस: 47, सत्तेचाळीस: 47,
  adtalis: 48, atthechalis: 48, अड़तालीस: 48, अठ्ठेचाळीस: 48,
  unchas: 49, ekonpannas: 49, उनचास: 49, एकोणपन्नास: 49,
  pachaas: 50, pachas: 50, pannas: 50, पचास: 50, पन्नास: 50,

  // 51-60
  ikyaavan: 51, ikyavan: 51, इक्यावन: 51,
  baavan: 52, bavan: 52, बावन: 52,
  tirepan: 53, तिरेपन: 53,
  chauwan: 54, chauvan: 54, चौवन: 54,
  pachpan: 55, पचपन: 55,
  chhappan: 56, छप्पन: 56,
  sattaavan: 57, sattavan: 57, सत्तावन: 57,
  atthaavan: 58, atthavan: 58, अट्ठावन: 58,
  unsath: 59, unnsath: 59, उनसठ: 59,
  saath: 60, sath: 60, साठ: 60,

  // 61-70
  iksath: 61, iksat: 61, इकसठ: 61,
  baasath: 62, basat: 62, बासठ: 62,
  tirasath: 63, tirsat: 63, तिरसठ: 63,
  chaunsath: 64, chausat: 64, चौंसठ: 64,
  painsath: 65, painstath: 65, पैंसठ: 65,
  chhiyaasath: 66, chhiyasat: 66, छियासठ: 66,
  sarsath: 67, सरसठ: 67,
  adsath: 68, अड़सठ: 68,
  unhattar: 69, unhatar: 69, उनहत्तर: 69,
  sattar: 70, सत्तर: 70,

  // 71-80
  ikhattar: 71, ikhatar: 71, इकहत्तर: 71,
  bahattar: 72, बहत्तर: 72,
  tihattar: 73, तिहत्तर: 73,
  chauhattar: 74, चौहत्तर: 74,
  pachhattar: 75, pachhatar: 75, पचहत्तर: 75,
  chhihattar: 76, छिहत्तर: 76,
  sathattar: 77, "sat-hattar": 77, सततत्तर: 77,
  "ath-hattar": 78, athattar: 78, अठहत्तर: 78,
  uniyasi: 79, unyasi: 79, उन्यासी: 79,
  assi: 80, aishi: 80, aishy: 80, अस्सी: 80, ऐंशी: 80,

  // 81-99
  ikyasi: 81, ikyasee: 81, इक्यासी: 81,
  bayasi: 82, bayasee: 82, बयासी: 82,
  tirasi: 83, tirasee: 83, तिरासी: 83,
  chaurasi: 84, chaurasee: 84, चौरासी: 84,
  pachasi: 85, pachasee: 85, पचासी: 85,
  chhiyasi: 86, chhiyasee: 86, छियासी: 86,
  sattasi: 87, sattasee: 87, सत्तासी: 87,
  atthasi: 88, atthasee: 88, अट्ठासी: 88,
  navasi: 89, navasee: 89, नवासी: 89,
  nabbe: 90, navvad: 90, navad: 90, नब्बे: 90, नव्वद: 90,
  ikyanve: 91, ikyanwe: 91, इक्यानवे: 91,
  banve: 92, "baa-nve": 92, बानवे: 92,
  tiranve: 93, tiranwe: 93, तिरानवे: 93,
  chauranve: 94, chauranwe: 94, चौरानवे: 94,
  panchanve: 95, panchanwe: 95, पंचानवे: 95,
  chhiyanve: 96, chhiyanwe: 96, छियानवे: 96,
  sattanve: 97, sattanwe: 97, सत्तानवे: 97,
  atthanve: 98, atthanwe: 98, अट्ठानवे: 98,
  ninyanve: 99, ninyanwe: 99, निन्यानवे: 99,
};

// Direct single-word Marathi and Hindi hundred compounds
const DIRECT_HUNDRED_WORDS: Record<string, number> = {
  // Marathi hundred words
  shambhar: 100, शंभर: 100, ekshe: 100, एकशे: 100,
  didhshe: 150, deedhshe: 150, दीडशे: 150,
  donshe: 200, दोनशे: 200,
  adichshe: 250, अडीचशे: 250,
  teenshe: 300, tinshe: 300, तीनशे: 300,
  charshe: 400, chaarshe: 400, चारशे: 400,
  pachshe: 500, panchshe: 500, पाचशे: 500,
  sahashe: 600, सहाशे: 600,
  saatshe: 700, सातशे: 700,
  aathshe: 800, आठशे: 800,
  naushe: 900, नऊशे: 900,
  akarashe: 1100, अकराशे: 1100,
  barashe: 1200, बाराशे: 1200,
  terashe: 1300, तेराशे: 1300,
  chaudashe: 1400, चौदाशे: 1400,
  pandrashe: 1500, pandhrashe: 1500, पंधराशे: 1500,
  solashe: 1600, solahshe: 1600, सोळाशे: 1600,
  satrashe: 1700, सतराशे: 1700,
  athrashe: 1800, atharashe: 1800, अठराशे: 1800,
  ekonishe: 1900, एकोणीसशे: 1900,
};

// Scale multipliers
const SCALE_WORDS: Record<string, number> = {
  // Hundreds
  sau: 100, सौ: 100, she: 100, शे: 100, hundred: 100,
  // Thousands
  hazaar: 1000, hazar: 1000, हजार: 1000, हज़ार: 1000, thousand: 1000,
  // Lakhs
  lakh: 100000, lac: 100000, लाख: 100000,
  // Crores
  crore: 10000000, करोड़: 10000000, करोड: 10000000,
};

/**
 * Parses numeric amounts from digits (e.g. "1,600", "₹1600", "१,६००")
 */
function parseDirectDigits(text: string): NumberParseResult | null {
  const normalized = normalizeDevanagariDigits(text);

  // Match digits with optional commas and optional decimal points
  // e.g. "₹ 1,600", "1600/-", "1600.00", "1600"
  const digitRegex = /(?:₹|rs\.?|rupaye|rupees|रुपये|रु\.)?\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?:\s*(?:rupaye|rupees|रुपये|\/-|\/))?/i;
  const match = normalized.match(digitRegex);

  if (match && match[1]) {
    const rawNumStr = match[1].replace(/,/g, "");
    const parsed = parseFloat(rawNumStr);
    if (!isNaN(parsed) && parsed > 0) {
      return {
        amount: Math.round(parsed * 100) / 100,
        matchedText: match[0].trim(),
        confidence: 0.99,
        isWordBased: false,
      };
    }
  }

  return null;
}

/**
 * Tokenizes text and parses natural Indian language number phrases.
 * Supports:
 * - "एक हजार छह सौ" -> 1600
 * - "एक हजार पांच सौ" -> 1500
 * - "दो हजार तीन सौ पचास" -> 2350
 * - "सोलह सौ" -> 1600
 * - "पंधराशे" -> 1500
 * - "पाचशे" -> 500
 * - "डेढ़ हजार" -> 1500
 * - "ढाई हजार" -> 2500
 * - "डेढ़ सौ" -> 150
 * - "ढाई सौ" -> 250
 */
function parseWordNumber(text: string): NumberParseResult | null {
  // Normalize Devanagari digits first
  const normalized = normalizeDevanagariDigits(text);

  // Clean tokens: keep alphanumeric and Devanagari characters
  const rawTokens = normalized
    .toLowerCase()
    .replace(/[^\w\s\u0900-\u097F]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (rawTokens.length === 0) return null;

  // Scan through tokens to find contiguous sequence of number-related tokens
  let bestResult: NumberParseResult | null = null;

  for (let i = 0; i < rawTokens.length; i++) {
    // Check if rawTokens[i] can start a number phrase
    const firstToken = rawTokens[i];
    const isNumToken =
      NUMBER_WORDS[firstToken] !== undefined ||
      DIRECT_HUNDRED_WORDS[firstToken] !== undefined ||
      SCALE_WORDS[firstToken] !== undefined ||
      firstToken === "dedh" || firstToken === "डेढ़" || firstToken === "दीड" ||
      firstToken === "dhai" || firstToken === "ढाई" || firstToken === "अडीच" ||
      firstToken === "saadhe" || firstToken === "साढ़े" || firstToken === "साडे" ||
      firstToken === "sawa" || firstToken === "सवा" ||
      firstToken === "paune" || firstToken === "पौने";

    if (!isNumToken) continue;

    // Collect full contiguous number phrase
    let j = i;
    const phraseTokens: string[] = [];
    while (j < rawTokens.length) {
      const tok = rawTokens[j];
      const valid =
        NUMBER_WORDS[tok] !== undefined ||
        DIRECT_HUNDRED_WORDS[tok] !== undefined ||
        SCALE_WORDS[tok] !== undefined ||
        tok === "dedh" || tok === "डेढ़" || tok === "दीड" ||
        tok === "dhai" || tok === "ढाई" || tok === "अडीच" ||
        tok === "saadhe" || tok === "साढ़े" || tok === "साडे" ||
        tok === "sawa" || tok === "सवा" ||
        tok === "paune" || tok === "पौने";

      if (valid) {
        phraseTokens.push(tok);
        j++;
      } else {
        break;
      }
    }

    if (phraseTokens.length > 0) {
      const parsedVal = evaluateNumberTokens(phraseTokens);
      if (parsedVal !== null && parsedVal > 0) {
        // If this parse is longer or has higher value, take it
        if (!bestResult || phraseTokens.length > bestResult.matchedText.split(" ").length) {
          bestResult = {
            amount: parsedVal,
            matchedText: phraseTokens.join(" "),
            confidence: 0.95,
            isWordBased: true,
          };
        }
      }
      i = j; // Advance outer loop past consumed phrase
    }
  }

  return bestResult;
}

/**
 * Evaluates an array of number tokens using Indian hierarchical arithmetic.
 */
function evaluateNumberTokens(tokens: string[]): number | null {
  if (tokens.length === 0) return null;

  // Check single-token direct Marathi hundreds first (e.g. "पंधराशे" = 1500, "पाचशे" = 500)
  if (tokens.length === 1 && DIRECT_HUNDRED_WORDS[tokens[0]] !== undefined) {
    return DIRECT_HUNDRED_WORDS[tokens[0]];
  }

  let total = 0;
  let currentGroup = 0;
  let hasNumber = false;

  for (let idx = 0; idx < tokens.length; idx++) {
    const token = tokens[idx];

    // Special fractional multipliers:
    // "डेढ़" (1.5), "ढाई" (2.5), "साढ़े" (+0.5)
    if (token === "dedh" || token === "डेढ़" || token === "दीड") {
      hasNumber = true;
      const nextToken = tokens[idx + 1];
      if (nextToken === "sau" || nextToken === "सौ" || nextToken === "she" || nextToken === "शे") {
        currentGroup += 150;
        idx++;
      } else if (nextToken === "hazaar" || nextToken === "hazar" || nextToken === "हजार" || nextToken === "हज़ार") {
        total += 1500;
        idx++;
      } else if (nextToken === "lakh" || nextToken === "लाख") {
        total += 150000;
        idx++;
      } else {
        currentGroup += 1.5;
      }
      continue;
    }

    if (token === "dhai" || token === "ढाई" || token === "अडीच") {
      hasNumber = true;
      const nextToken = tokens[idx + 1];
      if (nextToken === "sau" || nextToken === "सौ" || nextToken === "she" || nextToken === "शे") {
        currentGroup += 250;
        idx++;
      } else if (nextToken === "hazaar" || nextToken === "hazar" || nextToken === "हजार" || nextToken === "हज़ार") {
        total += 2500;
        idx++;
      } else if (nextToken === "lakh" || nextToken === "लाख") {
        total += 250000;
        idx++;
      } else {
        currentGroup += 2.5;
      }
      continue;
    }

    // Direct hundred compound word in phrase (e.g. "पंधराशे पन्नास" -> 1500 + 50)
    if (DIRECT_HUNDRED_WORDS[token] !== undefined) {
      hasNumber = true;
      const val = DIRECT_HUNDRED_WORDS[token];
      total += currentGroup + val;
      currentGroup = 0;
      continue;
    }

    // Scale words: Sau (100), Hazaar (1000), Lakh (100000), Crore (10000000)
    const scale = SCALE_WORDS[token];
    if (scale !== undefined) {
      hasNumber = true;
      const multiplier = currentGroup === 0 ? 1 : currentGroup;

      if (scale >= 1000) {
        // Thousand, Lakh, Crore
        total += multiplier * scale;
        currentGroup = 0;
      } else if (scale === 100) {
        // Hundred (Sau, She)
        // e.g. "छह सौ" -> 6 * 100 = 600
        // e.g. "सोलह सौ" -> 16 * 100 = 1600
        // e.g. "एक हजार छह सौ" -> 1000 + 6 * 100 = 1600
        total += multiplier * 100;
        currentGroup = 0;
      }
      continue;
    }

    // Standard base number word (1 - 99)
    const baseVal = NUMBER_WORDS[token];
    if (baseVal !== undefined) {
      hasNumber = true;
      currentGroup += baseVal;
      continue;
    }
  }

  total += currentGroup;
  return hasNumber && total > 0 ? total : null;
}

/**
 * Main entrance: reliably extracts numeric amounts from spoken or typed Hindi/Marathi/Hinglish text.
 * Digits take precedence when accompanied by currency signs or clean punctuation.
 * Otherwise, natural number phrases (hierarchical and compound) are fully parsed.
 */
export function extractAmountWithDetails(text: string): NumberParseResult | null {
  if (!text || typeof text !== "string") return null;

  // 1. Try direct digits match (e.g. "1,600", "₹500", "500/-")
  const digitResult = parseDirectDigits(text);
  if (digitResult) {
    return digitResult;
  }

  // 2. Try Hindi / Marathi / Hinglish natural number words
  const wordResult = parseWordNumber(text);
  if (wordResult) {
    return wordResult;
  }

  return null;
}

/**
 * Simple helper that returns numeric value or null
 */
export function extractAmount(text: string): number | null {
  const result = extractAmountWithDetails(text);
  return result ? result.amount : null;
}
