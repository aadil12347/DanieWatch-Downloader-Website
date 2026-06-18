export function cleanTitleForFilename(title) {
  if (!title) return '';
  let clean = title;
  
  // Remove leading "Download " or "Download"
  clean = clean.replace(/^download\s+/i, '');
  
  // Remove everything in brackets [] or braces {} or parentheses ()
  clean = clean.replace(/\[[^\]]*\]/g, '')
               .replace(/\{[^}]*\}/g, '')
               .replace(/\([^)]*\)/g, '');
    
  // Remove common keywords
  clean = clean.replace(/\b(dual\s+audio|multi\s+audio|dubbed|subbed|hindi|english|punjabi|tamil|telugu|kannada|malayalam|bengali|marathi|urdu|gujarati|japanese|korean|chinese|spanish|french|german|bluray|web-dl|webdl|hdtc|cam|ts|telesync|hdts|rip|org|original|4k-sdr|uhd|sdr|amazon\s+film|amazon\s+original|netflix\s+original|netflix|prime\s+video)\b/gi, '');
  
  // Remove season/episode info
  clean = clean.replace(/\bs\d+e\d+\b/gi, '')
               .replace(/\bs\d+\b/gi, '')
               .replace(/\be\d+\b/gi, '')
               .replace(/\bseason\s*\d+\b/gi, '')
               .replace(/\bepisode\s*\d+\b/gi, '')
               .replace(/\b(s\d+\s+e\d+|s\d+\s+episode\s+\d+)\b/gi, '');
               
  // Remove quality tags
  clean = clean.replace(/\b(480p|720p|1080p|2160p)\b/gi, '');
  
  // Remove video codecs / encodings / properties
  clean = clean.replace(/\b(x264|h264|x265|hevc|10bit|10-bit|10\s*bit|dds5\.1|dd5\.1|dd2\.0|ddp5\.1|hqc|hq|aac)\b/gi, '');
  
  // Replace non-alphanumeric with spaces, keep only alphanumeric and spaces
  clean = clean.replace(/[^a-zA-Z0-9\s]/g, ' ');
  
  // Clean multiple spaces
  clean = clean.replace(/\s+/g, ' ');
  
  return clean.trim();
}

export function detectLanguage(title) {
  if (!title) return 'Hindi'; // Default fallback
  const titleLower = title.toLowerCase();
  
  // Prioritized list of common languages
  const langs = [
    { name: 'Hindi', regex: /\bhindi\b/i },
    { name: 'Punjabi', regex: /\bpunjabi\b/i },
    { name: 'English', regex: /\b(english|eng)\b/i },
    { name: 'Tamil', regex: /\btamil\b/i },
    { name: 'Telugu', regex: /\btelugu\b/i },
    { name: 'Kannada', regex: /\bkannada\b/i },
    { name: 'Malayalam', regex: /\bmalayalam\b/i },
    { name: 'Bengali', regex: /\bbengali\b/i },
    { name: 'Marathi', regex: /\bmarathi\b/i },
    { name: 'Urdu', regex: /\burdu\b/i },
    { name: 'Japanese', regex: /\b(japanese|jap)\b/i },
    { name: 'Korean', regex: /\b(korean|kor)\b/i },
    { name: 'Chinese', regex: /\bchinese\b/i },
    { name: 'Spanish', regex: /\bspanish\b/i },
    { name: 'French', regex: /\bfrench\b/i },
    { name: 'German', regex: /\bgerman\b/i }
  ];
  
  // First look for curly braces or brackets containing languages
  const matchBraces = title.match(/\{([^}]+)\}/) || title.match(/\[([^\]]+)\]/);
  if (matchBraces) {
    const inside = matchBraces[1].toLowerCase();
    // Check if any lang matches inside braces/brackets first
    for (const lang of langs) {
      if (lang.regex.test(inside)) {
        return lang.name;
      }
    }
  }
  
  // Fallback to checking the whole title
  for (const lang of langs) {
    if (lang.regex.test(titleLower)) {
      return lang.name;
    }
  }
  
  return 'Hindi'; // Default fallback
}
