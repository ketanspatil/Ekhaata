/**
 * Name normalization and matching utility for Indic names (Hindi, Marathi, Hinglish, English).
 * Supports:
 * - Full multi-word customer names (first, middle, last name)
 * - Script-independent matching (Devanagari <-> Latin)
 * - Phonetic normalization (ee/i, oo/u, v/w, etc.)
 * - Ambiguity detection (e.g. multiple "Suresh"s)
 * - Strict full-name protection (never matches unrelated surnames)
 */

// Common Devanagari First Names dictionary
const DEVANAGARI_FIRST_NAMES: Record<string, string> = {
  सुरेश: "suresh",
  रमेश: "ramesh",
  अमित: "amit",
  महेश: "mahesh",
  अनिता: "anita",
  अनीता: "anita",
  दिनेश: "dinesh",
  राजेश: "rajesh",
  रोहित: "rohit",
  विकास: "vikas",
  संजय: "sanjay",
  राहुल: "rahul",
  सचिन: "sachin",
  दीपक: "deepak",
  दिपक: "deepak",
  राकेश: "rakesh",
  मनोज: "manoj",
  सुनील: "sunil",
  सुनिल: "sunil",
  पूजा: "pooja",
  पुजा: "pooja",
  प्रदीप: "pradeep",
  विजय: "vijay",
  अजय: "ajay",
  सुमित: "sumit",
  अनिल: "anil",
  संतोष: "santosh",
  गणेश: "ganesh",
  प्रिया: "priya",
  नेहा: "neha",
  कविता: "kavita",
  संगीता: "sangeeta",
  आरती: "aarti",
  रेखा: "rekha",
  आशा: "asha",
  सुनीता: "sunita",
  लता: "lata",
  सीमा: "seema",
  गीता: "geeta",
  किरण: "kiran",
  विशाल: "vishal",
  सागर: "sagar",
  आकाश: "akash",
  निखिल: "nikhil",
  गौरव: "gaurav",
  विवेक: "vivek",
  प्रशांत: "prashant",
  अमोल: "amol",
  प्रवीण: "pravin",
  निलेश: "nilesh",
  योगेश: "yogesh",
  संदीप: "sandeep",
  अतुल: "atul",
  चेतन: "chetan",
  हर्ष: "harsh",
  कुणाल: "kunal",
  मयूर: "mayur",
  ओंकार: "omkar",
  रोहन: "rohan",
  तुषार: "tushar",
  वैभव: "vaibhav",
};

// Common Devanagari Surnames & Middle Names dictionary
const DEVANAGARI_LAST_NAMES: Record<string, string> = {
  पाटिल: "patil",
  पाटील: "patil",
  कुमार: "kumar",
  शर्मा: "sharma",
  बाई: "bai",
  देशमुख: "deshmukh",
  गुप्ता: "gupta",
  वर्मा: "verma",
  यादव: "yadav",
  जोशी: "joshi",
  कांबळे: "kamble",
  पवार: "pawar",
  शिंदे: "shinde",
  जाधव: "jadhav",
  मोरे: "more",
  गायकवाड: "gaikwad",
  कुलकर्णी: "kulkarni",
  कदम: "kadam",
  सावंत: "sawant",
  साळुंखे: "salunkhe",
  चव्हाण: "chavan",
  भोसले: "bhosale",
  वाघ: "wagh",
  माने: "mane",
  नाईक: "naik",
  चौधरी: "chaudhary",
  सिंह: "singh",
  सिंग: "singh",
  झा: "jha",
  मिश्रा: "mishra",
  पांडे: "pandey",
  पांडेय: "pandey",
  तिवारी: "tiwari",
  त्रिपाठी: "tripathi",
  शुक्ला: "shukla",
  दुबे: "dubey",
  अग्रवाल: "agarwal",
  जैन: "jain",
  बंसल: "bansal",
  गोयल: "goyal",
  मित्तल: "mittal",
  मेहता: "mehta",
  शाह: "shah",
  पटेल: "patel",
  देसाई: "desai",
  ठाकूर: "thakur",
  लाल: "lal",
  प्रसाद: "prasad",
  राव: "rao",
  रेड्डी: "reddy",
};

// General Indic Phonetic Transliteration rules
const CONSONANTS: Record<string, string> = {
  क: "k", ख: "kh", ग: "g", घ: "gh", ङ: "ng",
  च: "ch", छ: "chh", ज: "j", झ: "jh", ञ: "ny",
  ट: "t", ठ: "th", ड: "d", ढ: "dh", ण: "n",
  त: "t", थ: "th", द: "d", ध: "dh", न: "n",
  प: "p", फ: "ph", ब: "b", भ: "bh", म: "m",
  य: "y", र: "r", ल: "l", व: "v", श: "sh",
  ष: "sh", स: "s", ह: "h", ळ: "l", क्ष: "ksh", ज्ञ: "gy",
};

const VOWELS: Record<string, string> = {
  अ: "a", आ: "aa", इ: "i", ई: "ee", उ: "u", ऊ: "oo",
  ऋ: "ri", ए: "e", ऐ: "ai", ओ: "o", औ: "au",
};

const MATRAS: Record<string, string> = {
  "ा": "a", "ि": "i", "ी": "i", "ु": "u", "ू": "u",
  "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au",
  "ं": "n", "ः": "h",
};

/**
 * Phonetically transliterates any Devanagari text to Roman ASCII
 */
export function transliterateDevanagari(text: string): string {
  if (!text) return "";

  // Split into words and check dictionary first
  const words = text.trim().split(/\s+/);
  const transliteratedWords = words.map((w) => {
    const cleanWord = w.replace(/[^\u0900-\u097F]/g, "");
    if (DEVANAGARI_FIRST_NAMES[cleanWord]) {
      return DEVANAGARI_FIRST_NAMES[cleanWord];
    }
    if (DEVANAGARI_LAST_NAMES[cleanWord]) {
      return DEVANAGARI_LAST_NAMES[cleanWord];
    }

    // General abugida transliteration
    let result = "";
    const chars = Array.from(cleanWord);
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const next = chars[i + 1];

      if (VOWELS[ch]) {
        result += VOWELS[ch];
      } else if (CONSONANTS[ch]) {
        result += CONSONANTS[ch];
        if (next === "्") {
          // Halant (virama): suppress inherent vowel 'a'
          i++; // skip halant
        } else if (next && MATRAS[next]) {
          result += MATRAS[next];
          i++; // skip matra
        } else if (next && !VOWELS[next] && !MATRAS[next] && next !== "्" && i < chars.length - 1) {
          // Inherent 'a' between consonants (except word-final schwa deletion in modern Hindi/Marathi)
          result += "a";
        }
      } else if (MATRAS[ch]) {
        result += MATRAS[ch];
      }
    }
    return result || cleanWord;
  });

  return transliteratedWords.join(" ");
}

/**
 * Normalizes a name string for reliable phonetic comparison.
 * - Converts Devanagari to Latin phonetic equivalents
 * - Removes honorific titles (ji, bhai, seth, etc.)
 * - Normalizes interchangeable vowel/consonant spellings (ee/i, oo/u, w/v)
 * - Returns clean lowercase whitespace-separated tokens
 */
export function normalizeCustomerName(name: string): string {
  if (!name || typeof name !== "string") return "";

  let cleaned = name.trim();

  // If text contains Devanagari characters, transliterate first
  if (/[\u0900-\u097F]/.test(cleaned)) {
    cleaned = transliterateDevanagari(cleaned);
  }

  cleaned = cleaned.toLowerCase();

  // Remove common Indian honorifics / titles at end of words
  cleaned = cleaned
    .replace(/\s+(ji|bhai|bhav|seth|saheb|setji|rao|tai|didi|anna|bhau)$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  // Phonetic simplifications:
  // 1. Double vowels to single: ee -> i, oo -> u, aa -> a
  cleaned = cleaned.replace(/ee/g, "i");
  cleaned = cleaned.replace(/oo/g, "u");
  cleaned = cleaned.replace(/aa/g, "a");

  // 2. Interchangeable consonants: w -> v
  cleaned = cleaned.replace(/w/g, "v");

  // 3. Remove punctuation / symbols
  cleaned = cleaned.replace(/[^a-z0-9\s]/g, "").trim();

  return cleaned;
}

/**
 * Checks if two individual name tokens match phonetically with tolerance for minor spelling variations.
 */
export function isTokenMatch(tokenA: string, tokenB: string): boolean {
  if (!tokenA || !tokenB) return false;
  if (tokenA === tokenB) return true;

  // Check token match: must start with the same initial letter!
  // Surnames and first names must never cross initial consonant boundaries (e.g. Ramesh vs Yogesh must never match)
  if (tokenA[0] !== tokenB[0]) {
    return false;
  }

  // If length is at least 4 and Levenshtein distance is 1 (e.g. "patil" vs "patle", "shinde" vs "shindi")
  if (Math.abs(tokenA.length - tokenB.length) <= 1 && Math.min(tokenA.length, tokenB.length) >= 4) {
    if (levenshteinDistance(tokenA, tokenB) <= 1) {
      return true;
    }
  }

  return false;
}

function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

export interface CustomerMatchResult {
  status: "exact_match" | "single_match" | "ambiguous" | "no_match";
  matchedName: string | null;
  ambiguousCandidates: string[];
  queryFirstToken: string;
}

/**
 * Matches an extracted query customer name against an array of existing customer names in the ledger.
 *
 * Rules:
 * 1. Exact full-name match (all tokens match in order) -> exact_match
 * 2. Partial match (query has 1 token matching the first name of ledger customers):
 *    - If exactly 1 ledger customer matches -> single_match
 *    - If 2 or more ledger customers match -> ambiguous (e.g. "Suresh Patil" & "Suresh Deshmukh")
 * 3. Surnames must never conflict (e.g. "Ramesh Kumar" will NEVER match "Ramesh Verma")
 * 4. If 0 customers match -> no_match
 */
export function matchCustomerNameAgainstLedger(
  queryName: string,
  existingLedgerNames: string[]
): CustomerMatchResult {
  const normQuery = normalizeCustomerName(queryName);
  const queryTokens = normQuery.split(/\s+/).filter(Boolean);

  const queryFirstToken = queryTokens[0] || queryName.trim();

  if (queryTokens.length === 0 || existingLedgerNames.length === 0) {
    return {
      status: "no_match",
      matchedName: null,
      ambiguousCandidates: [],
      queryFirstToken,
    };
  }

  // Pass 1: Check for Exact Full Name Match
  for (const existing of existingLedgerNames) {
    const normExisting = normalizeCustomerName(existing);
    if (normQuery === normExisting) {
      return {
        status: "exact_match",
        matchedName: existing,
        ambiguousCandidates: [],
        queryFirstToken,
      };
    }
  }

  // Pass 2: Check multi-token match (all query tokens match existing tokens in order)
  const fullCandidates: string[] = [];
  for (const existing of existingLedgerNames) {
    const normExisting = normalizeCustomerName(existing);
    const existingTokens = normExisting.split(/\s+/).filter(Boolean);

    if (queryTokens.length > 1) {
      // If query has multiple tokens, every query token must match the corresponding existing token!
      if (queryTokens.length <= existingTokens.length) {
        let allMatch = true;
        for (let i = 0; i < queryTokens.length; i++) {
          if (!isTokenMatch(queryTokens[i], existingTokens[i])) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) {
          fullCandidates.push(existing);
        }
      }
    }
  }

  if (fullCandidates.length === 1) {
    return {
      status: "exact_match",
      matchedName: fullCandidates[0],
      ambiguousCandidates: [],
      queryFirstToken,
    };
  } else if (fullCandidates.length > 1) {
    return {
      status: "ambiguous",
      matchedName: null,
      ambiguousCandidates: fullCandidates,
      queryFirstToken,
    };
  }

  // Pass 3: Single-token query (e.g. query is just "Suresh" or "सुरेश")
  if (queryTokens.length === 1) {
    const singleMatches: string[] = [];
    for (const existing of existingLedgerNames) {
      const normExisting = normalizeCustomerName(existing);
      const existingTokens = normExisting.split(/\s+/).filter(Boolean);

      // Check first name or any unique token
      if (existingTokens.length > 0 && isTokenMatch(queryTokens[0], existingTokens[0])) {
        singleMatches.push(existing);
      }
    }

    if (singleMatches.length === 1) {
      return {
        status: "single_match",
        matchedName: singleMatches[0],
        ambiguousCandidates: [],
        queryFirstToken,
      };
    } else if (singleMatches.length > 1) {
      return {
        status: "ambiguous",
        matchedName: null,
        ambiguousCandidates: singleMatches,
        queryFirstToken,
      };
    }
  }

  return {
    status: "no_match",
    matchedName: null,
    ambiguousCandidates: [],
    queryFirstToken,
  };
}

/**
 * Words that should never be considered part of a customer name
 */
export const NAME_STOPWORDS = new Set([
  // Latin / Hinglish conversational / grammatical
  "ko", "ne", "se", "ka", "ke", "ki", "che", "cha", "chi", "la", "na",
  "kadun", "chya", "var", "par", "pe", "mein", "se", "khatyavar", "khata", "khate",
  "udhaar", "udhari", "baaki", "baa", "jama", "likho", "likh", "liha", "nondva",
  "wapas", "diye", "diya", "dila", "dile", "de", "do", "dya", "debit", "credit",
  "hai", "hain", "aahe", "aahet", "hisaab", "hishob", "balance",
  "kya", "kitna", "kitne", "kiti", "rupaye", "rupees", "rupiya", "rs", "inr",
  "total", "kul", "ekun", "sab", "sabka", "dukaan", "store", "kirana",
  "batao", "bataiye", "bata", "saang", "saanga", "dekho", "dekh", "bgh", "bgha", "bol", "bolein",
  "karo", "kara", "kijiye", "naam", "naav", "kiske", "kiska", "kisko", "kiske", "koni", "kona",
  "kaunse", "kaun", "konache", "konacha",
  "bhaiya", "bhai", "bhau", "sunno", "suno", "zara", "are", "arre", "aaj", "kal", "parson",
  "aur", "ani", "and", "or",

  // Devanagari Hindi / Marathi
  "को", "ने", "से", "का", "के", "की", "ला", "ना", "चे", "चा", "ची", "कडून", "च्या",
  "वर", "पर", "पे", "में", "खात्यावर", "खाते", "खाता",
  "उधार", "उधारी", "बाकी", "जमा", "लिखो", "लिख", "लिहा", "नोंदवा",
  "वापस", "परत", "दिले", "दिला", "दिया", "दिए", "दिये", "दे", "दो", "द्या",
  "आहे", "आहेत", "है", "हैं", "हिसाब", "हिशोब", "हिशाब", "बैलेंस", "बॅलन्स",
  "काय", "क्या", "कितना", "कितने", "किती", "रुपये", "रुपया",
  "टोटल", "कुल", "एकूण", "सब", "सबका", "दुकान", "स्टोर", "किराना",
  "सांग", "सांगा", "बताओ", "बताइए", "बता", "बघ", "बघा", "देखो", "देख", "बोल", "बोलो",
  "करो", "करा", "कीजिए", "नाम", "नाव", "किसका", "किसके", "किसको", "कोणाचे", "कोण", "कौनसे", "कौन",
  "भैया", "भाई", "भाऊ", "सुनो", "जरा", "अरे", "आज", "काल", "परसों",
  "आणि", "और",
]);

/**
 * Cleans and validates a sequence of tokens as a customer name.
 * Extracts 1 to 3 valid name words, discarding leading conversational words or trailing amounts.
 */
export function cleanCandidateNameTokens(segment: string): string | null {
  if (!segment) return null;

  // Split into words by whitespace, stripping punctuation attached to tokens
  const rawTokens = segment
    .replace(/[.,!?;:()"'।]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (rawTokens.length === 0) return null;

  // Scan from the end of the segment backwards to find name tokens immediately preceding the marker
  const validTokens: string[] = [];

  for (let i = rawTokens.length - 1; i >= 0; i--) {
    const raw = rawTokens[i];
    const clean = raw.replace(/[^\w\u0900-\u097F]/g, "");
    if (!clean) continue;

    const lower = clean.toLowerCase();

    // If it's a stopword, stop going backward
    if (NAME_STOPWORDS.has(lower)) {
      // If we already collected name tokens, we're done (e.g. "Aaj Ramesh Kumar" -> collected ["Kumar", "Ramesh"], saw "Aaj" -> stop)
      if (validTokens.length > 0) {
        break;
      }
      continue;
    }

    // If it contains digits or is a number word, skip or stop
    if (/\d/.test(clean)) {
      if (validTokens.length > 0) break;
      continue;
    }

    // Check if token length is at least 2 chars
    if (clean.length < 2) continue;

    // We collect up to 3 name words (e.g. First, Middle, Last)
    validTokens.unshift(clean);
    if (validTokens.length >= 3) {
      break;
    }
  }

  if (validTokens.length === 0) return null;

  // Check if all tokens were somehow stopwords
  const isAllStopwords = validTokens.every((t) => NAME_STOPWORDS.has(t.toLowerCase()));
  if (isAllStopwords) return null;

  // Format nicely: If Devanagari, keep as is; if Latin, title-case each word
  const isDevanagari = validTokens.some((t) => /[\u0900-\u097F]/.test(t));
  if (isDevanagari) {
    return validTokens.join(" ");
  }

  return validTokens
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Extracts complete customer name from spoken text (Latin or Devanagari).
 * Preserves complete first, middle, and last names (e.g. "Suresh Patil", "सुरेश पाटिल").
 * Never extracts only the last word.
 */
export function extractCustomerName(text: string): string | null {
  if (!text || typeof text !== "string") return null;

  const trimmed = text.trim();

  // 1. Check compound marker phrases: e.g. "ke naam par", "के नाम पर", "च्या नावावर"
  const phraseMarkers = [
    /\s+(?:ke\s+naam\s+par|ke\s+naam\s+pe|chya\s+navavar|chya\s+khatyavar|के\s+नाम\s+पर|के\s+नाम\s+पे|च्या\s+नावावर|च्या\s+खात्यावर)(?:\s+|$|[.,!?।])/i,
    /\s+(?:ke\s+khate\s+mein|के\s+खाते\s+में)(?:\s+|$|[.,!?।])/i,
  ];

  for (const pRegex of phraseMarkers) {
    const match = trimmed.match(pRegex);
    if (match && match.index !== undefined) {
      const before = trimmed.substring(0, match.index).trim();
      const candidate = cleanCandidateNameTokens(before);
      if (candidate) return candidate;
    }
  }

  // 2. Check postposition grammar markers: "ko", "ne", "se", "ka", "ke", "ki", "la", "che", "cha", "chi", "kadun", "chya", etc.
  const markerWordRegex =
    /\s+(?:ko|ne|se|ka|ke|ki|la|che|cha|chi|kadun|chya|var|par|pe|को|ने|से|का|के|की|ला|चे|चा|ची|कडून|च्या|वर|पर|पे)(?:\s+|$|[.,!?।])/gi;

  let mMatch: RegExpExecArray | null;
  while ((mMatch = markerWordRegex.exec(trimmed)) !== null) {
    const before = trimmed.substring(0, mMatch.index).trim();
    const candidate = cleanCandidateNameTokens(before);
    if (candidate) {
      return candidate;
    }
  }

  // 3. Check attached Marathi suffixes (e.g. "Sureshla", "सुरेशला", "Suresh Patilla", "सुरेश पाटिलला")
  const attachedSuffixRegex =
    /(?:^|\s+)([A-Za-z\u0900-\u097F\s]{2,40}?)(?:la|chya|cha|che|chi|kadun|ला|च्या|चा|चे|ची|कडून)(?:\s+|$|[.,!?।])/i;
  const attMatch = trimmed.match(attachedSuffixRegex);
  if (attMatch && attMatch[1]) {
    const candidate = cleanCandidateNameTokens(attMatch[1].trim());
    if (candidate) return candidate;
  }

  // 4. Utterance before amount or action word (e.g. "Suresh Patil 500 rupaye")
  // Or standalone customer name (e.g. "Suresh Patil", "सुरेश पाटिल", "Patil")
  const candidateFromDirect = cleanCandidateNameTokens(trimmed);
  if (candidateFromDirect) {
    return candidateFromDirect;
  }

  return null;
}

/**
 * Capitalizes names nicely for display (e.g. "suresh patil" -> "Suresh Patil")
 */
export function formatCustomerNameForDisplay(name: string): string {
  if (!name) return "";
  // If Devanagari, preserve as is
  if (/[\u0900-\u097F]/.test(name)) {
    return name.trim();
  }
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
