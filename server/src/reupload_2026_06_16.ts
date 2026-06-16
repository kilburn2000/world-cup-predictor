import type { ParsedPrediction } from "./importSheet.js";

// [redacted] + [redacted] entries, re-transcribed by hand from the photo sheets
// (IMG_8653 / IMG_8654) on 2026-06-16 after the OCR import proved unreliable.
// Read off the red score boxes at high zoom; team names as printed (the importSheet
// resolver maps the aliases). Group rows: [home, hg, ag, away]. Knockout follows
// the fixed slot order R32-1..16, R16-1..8, QF-1..4, SF-1..2, THIRD, FINAL.

type G = [string, number, number, string];
type K = [string, number, number, string];

const KO_SLOTS = [
  ...Array.from({ length: 16 }, (_, i) => `R32-${i + 1}`),
  ...Array.from({ length: 8 }, (_, i) => `R16-${i + 1}`),
  ...Array.from({ length: 4 }, (_, i) => `QF-${i + 1}`),
  "SF-1", "SF-2", "THIRD", "FINAL",
];

function toParsed(group: G[], ko: K[]): ParsedPrediction[] {
  const out: ParsedPrediction[] = group.map(([home, hg, ag, away]) => ({ kind: "group", home, away, homeGoals: hg, awayGoals: ag }));
  ko.forEach(([home, hg, ag, away], i) => out.push({ kind: "knockout", slot: KO_SLOTS[i], home, away, homeGoals: hg, awayGoals: ag }));
  return out;
}

const DAVE_GROUP: G[] = [
  ["Mexico",2,0,"South Africa"],["Rep. of Korea",1,3,"Czechia"],["Canada",1,2,"Bosnia - Hertz"],
  ["USA",1,1,"Paraguay"],["Qatar",1,1,"Switzerland"],["Brazil",3,1,"Morocco"],["Haiti",2,1,"Scotland"],
  ["Australia",2,1,"Turkiye"],["Germany",3,0,"Curaçao"],["Netherlands",2,1,"Japan"],
  ["Ivory Coast",3,2,"Ecuador"],["Sweden",1,1,"Tunisia"],["Spain",2,0,"Cape Verde"],["Belgium",1,0,"Egypt"],
  ["Saudi Arabia",1,2,"Uruguay"],["IR Iran",0,2,"New Zealand"],["France",2,0,"Senegal"],["Iraq",0,1,"Norway"],
  ["Argentina",3,0,"Algeria"],["Austria",1,0,"Jordan"],["Portugal",2,0,"Congo DR"],["England",2,1,"Croatia"],
  ["Ghana",1,0,"Panama"],["Uzbekistan",1,3,"Colombia"],["Czechia",1,2,"South Africa"],
  ["Switzerland",2,1,"Bosnia - Hertz"],["Canada",3,1,"Qatar"],["Mexico",3,0,"Rep. of Korea"],
  ["USA",2,1,"Australia"],["Scotland",1,1,"Morocco"],["Brazil",5,0,"Haiti"],["Turkiye",2,2,"Paraguay"],
  ["Netherlands",2,1,"Sweden"],["Germany",2,0,"Ivory Coast"],["Ecuador",2,0,"Curaçao"],["Tunisia",1,2,"Japan"],
  ["Spain",2,0,"Saudi Arabia"],["Belgium",4,0,"IR Iran"],["Uruguay",3,1,"Cape Verde"],["New Zealand",1,3,"Egypt"],
  ["Argentina",2,0,"Austria"],["France",3,0,"Iraq"],["Norway",1,1,"Senegal"],["Jordan",2,2,"Algeria"],
  ["Portugal",2,0,"Uzbekistan"],["England",2,0,"Ghana"],["Panama",2,1,"Croatia"],["Colombia",1,1,"Congo DR"],
  ["Switzerland",1,0,"Canada"],["Bosnia - Hertz",2,0,"Qatar"],["Scotland",1,4,"Brazil"],["Morocco",2,1,"Haiti"],
  ["Czechia",1,2,"Mexico"],["South Africa",2,1,"Rep. of Korea"],["Curaçao",1,3,"Ivory Coast"],
  ["Ecuador",1,3,"Germany"],["Japan",1,1,"Sweden"],["Tunisia",1,2,"Netherlands"],["Turkiye",2,1,"USA"],
  ["Paraguay",2,1,"Australia"],["Norway",0,2,"France"],["Senegal",1,0,"Iraq"],["Cape Verde",0,1,"Saudi Arabia"],
  ["Uruguay",2,2,"Spain"],["Egypt",3,0,"IR Iran"],["New Zealand",1,2,"Belgium"],["Panama",1,3,"England"],
  ["Croatia",2,1,"Ghana"],["Colombia",1,2,"Portugal"],["Congo DR",2,0,"Uzbekistan"],["Algeria",0,1,"Austria"],
  ["Jordan",0,2,"Argentina"],
];

const DAVE_KO: K[] = [
  ["Germany",2,0,"Scotland"],["France",2,1,"USA"],["South Africa",2,0,"Bosnia - Hertz"],["Netherlands",3,0,"Morocco"],
  ["Columbia",1,0,"Croatia"],["Spain",2,0,"Austria"],["Paraguay",2,1,"Canada"],["Belgium",3,1,"Czechia"],
  ["Brazil",2,0,"Japan"],["Ivory Coast",2,1,"Senegal"],["Mexico",1,0,"Ecuador"],["England",1,0,"Congo DR"],
  ["Argentina",1,1,"Uruguay"],["Turkiye",1,2,"Egypt"],["Switzerland",1,0,"New Zealand"],["Portugal",2,0,"Norway"],
  ["Germany",1,2,"France"],["South Africa",2,0,"Netherlands"],["Columbia",1,3,"Spain"],["Paraguay",2,0,"Belgium"],
  ["Brazil",3,1,"Ivory Coast"],["Mexico",2,2,"England"],["Argentina",2,0,"Egypt"],["Switzerland",1,2,"Portugal"],
  ["France",2,0,"South Africa"],["Spain",2,0,"Paraguay"],["Brazil",2,1,"Mexico"],["Argentina",2,0,"Portugal"],
  ["France",2,2,"Spain"],["Brazil",3,2,"Argentina"],["France",1,3,"Argentina"],["Spain",1,3,"Brazil"],
];

const LUCY_GROUP: G[] = [
  ["Mexico",3,0,"South Africa"],["Rep. of Korea",1,1,"Czechia"],["Canada",2,1,"Bosnia - Hertz"],
  ["USA",2,1,"Paraguay"],["Qatar",0,3,"Switzerland"],["Brazil",2,1,"Morocco"],["Haiti",0,3,"Scotland"],
  ["Australia",1,2,"Turkiye"],["Germany",3,0,"Curaçao"],["Netherlands",1,1,"Japan"],["Ivory Coast",1,2,"Ecuador"],
  ["Sweden",2,1,"Tunisia"],["Spain",3,0,"Cape Verde"],["Belgium",3,0,"Egypt"],["Saudi Arabia",0,3,"Uruguay"],
  ["IR Iran",1,1,"New Zealand"],["France",3,0,"Senegal"],["Iraq",0,3,"Norway"],["Argentina",3,0,"Algeria"],
  ["Austria",3,0,"Jordan"],["Portugal",3,0,"Congo DR"],["England",2,1,"Croatia"],["Ghana",2,1,"Panama"],
  ["Uzbekistan",0,3,"Colombia"],["Czechia",2,1,"South Africa"],["Switzerland",3,0,"Bosnia - Hertz"],
  ["Canada",2,1,"Qatar"],["Mexico",2,1,"Rep. of Korea"],["USA",2,1,"Australia"],["Scotland",1,2,"Morocco"],
  ["Brazil",3,0,"Haiti"],["Turkiye",2,1,"Paraguay"],["Netherlands",2,1,"Sweden"],["Germany",3,0,"Ivory Coast"],
  ["Ecuador",3,0,"Curaçao"],["Tunisia",0,3,"Japan"],["Spain",3,0,"Saudi Arabia"],["Belgium",3,0,"IR Iran"],
  ["Uruguay",3,0,"Cape Verde"],["New Zealand",1,2,"Egypt"],["Argentina",3,0,"Austria"],["France",3,0,"Iraq"],
  ["Norway",2,1,"Senegal"],["Jordan",0,3,"Algeria"],["Portugal",3,0,"Uzbekistan"],["England",3,0,"Ghana"],
  ["Panama",0,3,"Croatia"],["Colombia",3,0,"Congo DR"],["Switzerland",2,1,"Canada"],["Bosnia - Hertz",1,1,"Qatar"],
  ["Scotland",0,3,"Brazil"],["Morocco",3,0,"Haiti"],["Czechia",0,3,"Mexico"],["South Africa",1,2,"Rep. of Korea"],
  ["Curaçao",0,3,"Ivory Coast"],["Ecuador",1,2,"Germany"],["Japan",2,1,"Sweden"],["Tunisia",0,3,"Netherlands"],
  ["Turkiye",1,1,"USA"],["Paraguay",1,1,"Australia"],["Norway",1,2,"France"],["Senegal",3,0,"Iraq"],
  ["Cape Verde",1,1,"Saudi Arabia"],["Uruguay",1,2,"Spain"],["Egypt",2,1,"IR Iran"],["New Zealand",0,3,"Belgium"],
  ["Panama",0,3,"England"],["Croatia",2,1,"Ghana"],["Colombia",1,2,"Portugal"],["Congo DR",2,1,"Uzbekistan"],
  ["Algeria",1,2,"Austria"],["Jordan",0,3,"Argentina"],
];

const LUCY_KO: K[] = [
  ["Rep. of Korea",1,1,"Canada"],["Brazil",2,1,"Japan"],["Germany",3,0,"Scotland"],["Netherlands",1,1,"Morocco"],
  ["Ecuador",1,2,"Norway"],["France",3,0,"Sweden"],["Mexico",2,1,"Ivory Coast"],["England",3,0,"Congo DR"],
  ["Belgium",3,0,"Czechia"],["USA",2,1,"Senegal"],["Spain",3,0,"Austria"],["Colombia",2,1,"Croatia"],
  ["Switzerland",2,1,"Algeria"],["Turkiye",2,1,"Egypt"],["Argentina",2,1,"Uruguay"],["Portugal",3,0,"Ghana"],
  ["Canada",0,3,"Netherlands"],["Germany",1,2,"France"],["Brazil",1,1,"Norway"],["Mexico",1,2,"England"],
  ["Colombia",1,2,"Spain"],["USA",1,1,"Belgium"],["Argentina",2,1,"Turkiye"],["Switzerland",1,2,"Portugal"],
  ["France",2,1,"Netherlands"],["Spain",2,1,"Belgium"],["Brazil",1,1,"England"],["Argentina",1,1,"Portugal"],
  ["France",1,1,"Spain"],["England",1,1,"Argentina"],["Spain",1,1,"Argentina"],["France",1,1,"England"],
];

export const REUPLOAD_2026_06_16: { entrant: string; predictions: ParsedPrediction[] }[] = [
  { entrant: "[redacted]", predictions: toParsed(DAVE_GROUP, DAVE_KO) },
  { entrant: "[redacted]", predictions: toParsed(LUCY_GROUP, LUCY_KO) },
];
