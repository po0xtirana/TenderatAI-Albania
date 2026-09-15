import { normalize } from "./normalize";

export type CpvSpecialization = {
  id: string;
  code: string;
  labelAl: string;
  descriptionAl: string;
  examples: string[];
  aliases: string[];
  projectTypes: string[];
  buildingTypes: string[];
};

export type CpvSuggestion = CpvSpecialization & {
  score: number;
  reason: string;
};

// Construction-focused subset of the official CPV vocabulary, enriched with Albanian
// trade language. The official code remains the identifier; aliases only improve search.
export const CONSTRUCTION_CPV_CATALOG: CpvSpecialization[] = [
  { id: "building", code: "45210000", labelAl: "Ndërtim ndërtesash", descriptionAl: "Ndërtim i plotë i godinave dhe objekteve.", examples: ["pallate", "godina publike", "objekte biznesi"], aliases: ["ndertim godine", "ndertim pallati", "ndertim objekti", "ndertesa"], projectTypes: ["ndërtim i ri"], buildingTypes: ["godina", "pallate", "ndërtesa publike"] },
  { id: "multi-building", code: "45211340", labelAl: "Ndërtim pallatesh", descriptionAl: "Ndërtim godinash shumëbanesore.", examples: ["pallat banimi", "kompleks rezidencial"], aliases: ["pallat", "pallate", "godine banimi", "apartamente", "rezidencial"], projectTypes: ["ndërtim rezidencial"], buildingTypes: ["pallate", "godina banimi"] },
  { id: "refurbishment", code: "45453100", labelAl: "Rikonstruksion dhe rinovim", descriptionAl: "Rinovim i ndërtesave ekzistuese dhe përmirësim i ambienteve.", examples: ["rikonstruksion shkolle", "rinovim godine", "rehabilitim ambientesh"], aliases: ["rikonstruksion", "rindertim", "rinovim", "rehabilitim godine", "sanim"], projectTypes: ["rikonstruksion", "rinovim"], buildingTypes: ["godina ekzistuese"] },
  { id: "facade", code: "45443000", labelAl: "Punime fasade", descriptionAl: "Ndërtim, riparim dhe përfundim i fasadave të jashtme.", examples: ["fasadë pallati", "fasadë e ventiluar", "rikonstruksion fasade"], aliases: ["fasade", "fasada", "veshje fasade", "fasade pallati", "fasade godine", "fasade e ventiluar"], projectTypes: ["fasadë", "rikonstruksion"], buildingTypes: ["pallate", "godina"] },
  { id: "wall-covering", code: "45432210", labelAl: "Veshje muresh", descriptionAl: "Veshje të brendshme ose të jashtme me gur, pllaka dhe sisteme panelesh.", examples: ["veshje me gur", "veshje me pllaka", "panele muri"], aliases: ["veshje me gur", "gur dekorativ", "veshje muri", "veshje fasade me gur", "panele fasade", "panele kompozite", "alucobond"], projectTypes: ["veshje fasade", "punime përfundimtare"], buildingTypes: ["fasada", "mure"] },
  { id: "panelling", code: "45451200", labelAl: "Montim panelesh", descriptionAl: "Vendosje panelesh dekorative, kompozite ose funksionale.", examples: ["panele alumini", "panele kompozite", "veshje panelesh"], aliases: ["panele", "panel", "panel alumini", "panel kompozit", "alucobond", "fasade me panele"], projectTypes: ["montim panelesh", "veshje fasade"], buildingTypes: ["fasada", "godina"] },
  { id: "thermal-insulation", code: "45321000", labelAl: "Izolim termik", descriptionAl: "Sisteme termoizolimi për mure, fasada dhe ndërtesa.", examples: ["sistem kapotë", "polisterol fasade", "lesh guri"], aliases: ["termoizolim", "izolim termik", "kapote", "polisterol", "lesh guri", "izolim fasade"], projectTypes: ["eficiencë energjetike", "izolim"], buildingTypes: ["fasada", "çati", "godina"] },
  { id: "plastering", code: "45410000", labelAl: "Suvatim", descriptionAl: "Suvatim i sipërfaqeve të brendshme dhe të jashtme.", examples: ["suva fasade", "suvatim muri"], aliases: ["suvatim", "suva", "llac", "suvatim fasade"], projectTypes: ["punime përfundimtare"], buildingTypes: ["fasada", "mure"] },
  { id: "painting", code: "45442110", labelAl: "Lyerje ndërtesash", descriptionAl: "Lyerje e brendshme dhe e jashtme e godinave.", examples: ["lyerje fasade", "bojatisje ambientesh"], aliases: ["lyerje", "bojatisje", "boje", "lyerje fasade", "lyerje godine"], projectTypes: ["lyerje", "mirëmbajtje"], buildingTypes: ["godina", "fasada"] },
  { id: "protective-coating", code: "45442000", labelAl: "Veshje mbrojtëse", descriptionAl: "Aplikim shtresash mbrojtëse dhe trajtim sipërfaqesh.", examples: ["veshje hidroizoluese", "mbrojtje betoni", "veshje antikorrozive"], aliases: ["veshje mbrojtese", "shtrese mbrojtese", "trajtim siperfaqe", "antikorroziv"], projectTypes: ["mbrojtje sipërfaqesh"], buildingTypes: ["fasada", "struktura"] },
  { id: "roof-general", code: "45260000", labelAl: "Punime çatie", descriptionAl: "Punime të përgjithshme për çati dhe zanate të specializuara.", examples: ["ndërtim çatie", "rindërtim çatie", "rikonstruksion çatie"], aliases: ["cati", "çati", "rindertim catie", "rikonstruksion catie", "ndertim catie", "mbulese"], projectTypes: ["çati", "rikonstruksion"], buildingTypes: ["çati", "godina"] },
  { id: "roof-frame", code: "45261100", labelAl: "Konstruksion çatie", descriptionAl: "Ndërtim ose zëvendësim i skeletit mbajtës të çatisë.", examples: ["konstruksion druri", "konstruksion metalik"], aliases: ["skelet catie", "konstruksion catie", "dru catie", "kapriata", "struktur metalike catie"], projectTypes: ["konstruksion çatie"], buildingTypes: ["çati"] },
  { id: "roof-covering", code: "45261210", labelAl: "Mbulesë çatie", descriptionAl: "Vendosje e mbulesës së çatisë.", examples: ["tjegulla", "llamarinë", "membranë bituminoze"], aliases: ["mbulim catie", "mbulese catie", "tjegulla", "llamarine", "panel sanduic catie"], projectTypes: ["mbulim çatie"], buildingTypes: ["çati"] },
  { id: "roof-tiles", code: "45261211", labelAl: "Mbulim me tjegulla", descriptionAl: "Vendosje dhe zëvendësim i tjegullave të çatisë.", examples: ["tjegulla qeramike", "tjegulla betoni"], aliases: ["tjegulla", "cati me tjegulla"], projectTypes: ["mbulim çatie"], buildingTypes: ["çati"] },
  { id: "metal-roof", code: "45261213", labelAl: "Mbulim metalik çatie", descriptionAl: "Mbulim çatie me llamarinë ose panele metalike.", examples: ["llamarinë e profiluar", "panel sanduiç"], aliases: ["llamarine catie", "panel sanduic", "mbulese metalike", "cati metalike"], projectTypes: ["mbulim metalik"], buildingTypes: ["çati", "magazina"] },
  { id: "guttering", code: "45261320", labelAl: "Ulluqe dhe shkarkime", descriptionAl: "Montim dhe riparim ulluqesh e sistemeve të ujërave të shiut.", examples: ["ulluqe", "tuba vertikalë", "shkarkime çatie"], aliases: ["ulluqe", "ulluqet", "shkarkime catie", "tuba shiu"], projectTypes: ["kullim çatie"], buildingTypes: ["çati", "fasada"] },
  { id: "roof-insulation", code: "45261410", labelAl: "Izolim çatie", descriptionAl: "Termoizolim i çative dhe tarracave.", examples: ["lesh guri", "XPS", "izolim tarrace"], aliases: ["izolim catie", "termoizolim catie", "izolim tarrace"], projectTypes: ["izolim"], buildingTypes: ["çati", "tarraca"] },
  { id: "waterproofing", code: "45261420", labelAl: "Hidroizolim", descriptionAl: "Hidroizolim çatie, tarrace, fasade ose strukture.", examples: ["membranë bituminoze", "hidroizolim tarrace", "izolim kundër ujit"], aliases: ["hidroizolim", "izolim uji", "membrane bituminoze", "katram", "hidroizolim fasade"], projectTypes: ["hidroizolim"], buildingTypes: ["çati", "tarraca", "fasada", "themele"] },
  { id: "roof-repair", code: "45261910", labelAl: "Riparim çatie", descriptionAl: "Riparim dhe rikonstruksion i çative ekzistuese.", examples: ["ndërrim mbulese", "riparim rrjedhjesh", "rindërtim çatie"], aliases: ["riparim catie", "rindertim catie", "rikonstruksion catie", "mirembajtje catie"], projectTypes: ["riparim", "rikonstruksion"], buildingTypes: ["çati"] },
  { id: "scaffolding", code: "45262100", labelAl: "Punime skelerie", descriptionAl: "Montim, përdorim dhe çmontim skelerish.", examples: ["skeleri fasade", "skeleri për çati"], aliases: ["skeleri", "skele", "montim skele", "skeleri fasade"], projectTypes: ["skeleri"], buildingTypes: ["fasada", "çati"] },
  { id: "demolition", code: "45111100", labelAl: "Prishje", descriptionAl: "Prishje dhe heqje e elementeve ose strukturave ekzistuese.", examples: ["prishje muresh", "heqje fasade", "çmontim çatie"], aliases: ["prishje", "demolim", "cmontim", "heqje strukture", "heqje fasade"], projectTypes: ["prishje", "rikonstruksion"], buildingTypes: ["godina", "struktura"] },
  { id: "concrete", code: "45262300", labelAl: "Punime betoni", descriptionAl: "Betonim dhe punime strukturore prej betoni.", examples: ["pllakë betoni", "kolona", "trarë"], aliases: ["beton", "betonim", "beton arme", "strukture betoni"], projectTypes: ["punime strukturore"], buildingTypes: ["godina", "infrastrukturë"] },
  { id: "masonry", code: "45262522", labelAl: "Muraturë", descriptionAl: "Ndërtim dhe riparim muresh me tulla, blloqe ose gur.", examples: ["mur tulle", "mur guri", "blloqe betoni"], aliases: ["murature", "mur guri", "mur tulle", "blloqe", "murim"], projectTypes: ["muraturë"], buildingTypes: ["godina", "mure"] },
  { id: "electrical", code: "45310000", labelAl: "Instalime elektrike", descriptionAl: "Instalime dhe sisteme elektrike në ndërtesa e infrastrukturë.", examples: ["kabllime", "panele elektrike", "ndriçim"], aliases: ["elektrike", "instalime elektrike", "kabllim", "ndricim"], projectTypes: ["instalime"], buildingTypes: ["godina", "infrastrukturë"] },
  { id: "plumbing", code: "45330000", labelAl: "Instalime hidraulike", descriptionAl: "Instalime ujësjellësi, sanitare, ngrohjeje dhe tubacionesh në objekte.", examples: ["instalime sanitare", "tubacione", "ujë dhe shkarkime"], aliases: ["hidraulike", "instalime sanitare", "tubacione godine", "uje sanitare"], projectTypes: ["instalime"], buildingTypes: ["godina"] },
  { id: "roads", code: "45233120", labelAl: "Ndërtim rrugësh", descriptionAl: "Ndërtim dhe rikonstruksion i trupit të rrugës.", examples: ["rrugë urbane", "rrugë rurale", "segment rrugor"], aliases: ["rruge", "ndertim rruge", "rikonstruksion rruge", "infrastrukture rrugore"], projectTypes: ["rrugë", "infrastrukturë"], buildingTypes: ["rrugë"] },
  { id: "asphalt", code: "45233222", labelAl: "Asfaltim", descriptionAl: "Shtrim dhe riveshje e sipërfaqeve me asfalt.", examples: ["shtresë asfaltobetoni", "riveshje rruge"], aliases: ["asfalt", "asfaltim", "asfaltobetoni", "shtrim asfalt"], projectTypes: ["asfaltim"], buildingTypes: ["rrugë", "sheshe"] },
  { id: "water-main", code: "45232150", labelAl: "Rrjete ujësjellësi", descriptionAl: "Ndërtim dhe rikonstruksion i linjave të furnizimit me ujë.", examples: ["tubacion uji", "rrjet shpërndarës", "linjë transmetimi"], aliases: ["ujesjelles", "rrjet ujesjellesi", "furnizim me uje", "tubacion uji"], projectTypes: ["ujësjellës", "infrastrukturë"], buildingTypes: ["rrjete"] },
  { id: "sewer", code: "45232400", labelAl: "Rrjete kanalizimesh", descriptionAl: "Ndërtim dhe rikonstruksion i kanalizimeve dhe shkarkimeve.", examples: ["kanalizime KUZ", "ujëra të ndotura", "kolektor"], aliases: ["kanalizime", "kanalizim", "kuz", "ujera te ndotura", "kolektor"], projectTypes: ["kanalizime", "infrastrukturë"], buildingTypes: ["rrjete"] }
];

const SEARCH_STOP_WORDS = new Set(["dhe", "ose", "per", "nga", "nje", "pune", "punime", "sistem", "sisteme", "vendosje", "aplikim", "ndertim"]);
const tokens = (value: string) => normalize(value).split(/[^a-z0-9]+/).filter((token) => token.length > 2 && !SEARCH_STOP_WORDS.has(token));

export function suggestCpvSpecializations(query: string, limit = 8): CpvSuggestion[] {
  const normalizedQuery = normalize(query).trim();
  if (normalizedQuery.length < 2) return [];
  const queryTokens = new Set(tokens(query));

  return CONSTRUCTION_CPV_CATALOG.map((item) => {
    const phrases = [item.labelAl, item.descriptionAl, ...item.aliases, ...item.examples];
    const normalizedPhrases = phrases.map(normalize);
    const exactPhrase = normalizedPhrases.some((phrase) => normalizedQuery.includes(phrase) || phrase.includes(normalizedQuery));
    const overlap = new Set(normalizedPhrases.flatMap(tokens).filter((token) => queryTokens.has(token))).size;
    const aliasStarts = normalizedPhrases.some((phrase) => tokens(phrase).some((token) => [...queryTokens].some((queryToken) => token.startsWith(queryToken) || queryToken.startsWith(token))));
    const score = Math.min(100, (exactPhrase ? 72 : 0) + overlap * 14 + (aliasStarts ? 8 : 0));
    return { ...item, score, reason: exactPhrase ? "Përputhje e drejtpërdrejtë me përshkrimin" : `${overlap} terma të përbashkët me specializimin` };
  }).filter((item) => item.score >= 28).sort((a, b) => b.score - a.score || a.labelAl.localeCompare(b.labelAl, "sq")).slice(0, limit);
}

export function findCpvByIds(ids: string[]): CpvSpecialization[] {
  const wanted = new Set(ids);
  return CONSTRUCTION_CPV_CATALOG.filter((item) => wanted.has(item.id));
}

export function searchTermsForCpvCodes(codes: string[]): string[] {
  return CONSTRUCTION_CPV_CATALOG.filter((item) => codes.some((code) => item.code.startsWith(code) || code.startsWith(item.code)))
    .flatMap((item) => [item.labelAl, ...item.aliases, ...item.examples]);
}
