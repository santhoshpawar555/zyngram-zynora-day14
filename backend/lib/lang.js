const SUPPORTED_LANGS = ["en", "hi", "te"]; // add more here + stopwords + refusal below
const LANG_LABELS = { en: "English", hi: "Hindi", te: "Telugu" };


function wordScript(w) {
  if (/[\u0900-\u097F]/.test(w)) return "hi";
  if (/[\u0C00-\u0C7F]/.test(w)) return "te";
  if (/[A-Za-z]/.test(w)) return "en";
  if (/\p{L}/u.test(w)) return "other";
  return null; // digits / punctuation only
}

function detectLanguage(text) {
  const counts = { en: 0, hi: 0, te: 0, other: 0 };
  let total = 0;
  for (const w of String(text || "").split(/\s+/)) {
    const sc = wordScript(w);
    if (sc) { counts[sc]++; total++; }
  }
  if (!total) return "en";
  if (counts.other / total >= 0.3) return "other";
  const nonLatin = ["hi", "te"].sort((a, b) => counts[b] - counts[a])[0];
  if (counts[nonLatin] / total >= 0.3) return nonLatin;
  return "en";
}

const REFUSAL = {
  en: "I couldn't find this information in the approved Zyngram knowledge base.",
  hi: "मुझे यह जानकारी Zyngram के स्वीकृत नॉलेज बेस में नहीं मिली। कृपया अपना प्रश्न दूसरे शब्दों में पूछें या इसे अंग्रेज़ी में पूछकर देखें।",
  te: "ఈ సమాచారం Zyngram ఆమోదిత నాలెడ్జ్ బేస్‌లో నాకు కనిపించలేదు. దయచేసి ప్రశ్నను వేరే విధంగా అడగండి లేదా ఇంగ్లీష్‌లో అడిగి చూడండి.",
  other:
    "Sorry, I currently support English, Hindi and Telugu only. / क्षमा करें, अभी मैं केवल अंग्रेज़ी, हिंदी और तेलुगु समझता हूँ। / క్షమించండి, ప్రస్తుతం నేను ఇంగ్లీష్, హిందీ, తెలుగు మాత్రమే అర్థం చేసుకోగలను.",
};
const refusal = (lang) => REFUSAL[lang] || REFUSAL.en;

const STOPWORDS = {
  hi: new Set(["है","हैं","था","थी","थे","हो","होता","होती","होते","का","की","के","में","से","को","पर","और","या","भी","तो","कि","यह","वह","ये","वो","क्या","कैसे","कौन","कब","कहाँ","कहां","क्यों","कितना","कितनी","कितने","मुझे","मेरा","मेरी","आप","आपका","हम","हमारा","बताइए","बताइये","बताओ","बताएं","कृपया","लिए","एक","इस","उस","जो","कोई"]),
  te: new Set(["ఏమిటి","ఏంటి","ఏమిటీ","ఎలా","ఎవరు","ఎప్పుడు","ఎక్కడ","ఎందుకు","ఎంత","ఏ","ఈ","ఆ","మరియు","లేదా","నాకు","నా","మీరు","మీ","మేము","మన","చెప్పండి","చెప్పు","దయచేసి","ఉంది","ఉన్నాయి","అనేది","అంటే","కోసం","ఒక","కూడా"]),
};
const EMPTY = new Set();
const stopwordsFor = (lang) => STOPWORDS[lang] || EMPTY;

// Telugu is agglutinative: strip a few very common case suffixes (applied to queries AND chunks).
const TE_SUFFIXES = ["యొక్క", "లోని", "తో", "లో", "ని", "ను", "కు", "కి", "లు", "ల"];
function stemNonEnglish(word, lang) {
  if (lang !== "te") return word;
  for (const suf of TE_SUFFIXES) {
    if (word.endsWith(suf) && word.length - suf.length >= 3) return word.slice(0, -suf.length);
  }
  return word;
}

// Hindi / Telugu prompt-injection phrases (the English list in zynoraService does not cover these).
// Review with a native speaker before production.
const INJECTION_PATTERNS_I18N = [
  /(पिछले|पिछली|सभी|सारे|अपने)\s*(निर्देश|नियम|निर्देशों|नियमों)(\s*को)?\s*(अनदेखा|नज़रअंदाज़|नजरअंदाज|भूल|इग्नोर)/,
  /(इंटरनेट|गूगल|वेब|ऑनलाइन)\s*(पर|से)?\s*(खोज|सर्च|ढूंढ|देख)/,
  /अपनी\s*(जानकारी|समझ)\s*(से|का)\s*(उपयोग|इस्तेमाल|जवाब)/,
  /(अंदाज़ा|अंदाजा|अनुमान)\s*(लगाकर|से)\s*(बताओ|बताइए|जवाब)/,
  /(सिस्टम\s*प्रॉम्प्ट|सिस्टम\s*निर्देश)/,
  /(మునుపటి|అన్ని|నీ|మీ)\s*(సూచనలు|సూచనలను|నియమాలు|నియమాలను)\s*(పట్టించుకోవద్దు|విస్మరించు|మర్చిపో|ఇగ్నోర్)/,
  /(ఇంటర్నెట్|గూగుల్|వెబ్|ఆన్‌లైన్)\s*(లో|నుండి)?\s*(వెతుకు|సెర్చ్|చూడు)/,
  /(ఊహించి|అంచనా వేసి)\s*(చెప్పు|చెప్పండి|సమాధానం)/,
  /సిస్టమ్\s*ప్రాంప్ట్/,
];

// Language-specific "asking for a number / a duration" hints used by the boundary guard.
const NUMERIC_HINT = {
  hi: /(कितना|कितनी|कितने|कीमत|मूल्य|शुल्क|फीस|फ़ीस|प्रतिशत|कमीशन|वेतन)/,
  te: /(ఎంత|ధర|ఫీజు|రుసుము|శాతం|కమీషన్|జీతం)/,
};
const DURATION_HINT = {
  hi: /(कितना\s*समय|कितने\s*दिन|कितने\s*घंटे|कितनी\s*देर|अवधि)/,
  te: /(ఎంత\s*సమయం|ఎన్ని\s*రోజులు|ఎన్ని\s*గంటలు|వ్యవధి)/,
};
const TIME_HINT = /(\d+\s*(से|to|-)?\s*\d*\s*(दिन|घंटे|घंटा|मिनट|सप्ताह|हफ्ते|महीने|साल|రోజులు|రోజు|గంటలు|గంట|నిమిషాలు|వారాలు|నెలలు|సంవత్సరాలు))/;

module.exports = {
  SUPPORTED_LANGS, LANG_LABELS, detectLanguage, refusal, stopwordsFor, stemNonEnglish,
  INJECTION_PATTERNS_I18N, NUMERIC_HINT, DURATION_HINT, TIME_HINT,
};