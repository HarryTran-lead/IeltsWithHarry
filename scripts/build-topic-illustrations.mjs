import { mkdir, writeFile } from "node:fs/promises";

// Original, small vector scenes. The same assets are used by the map, lessons and
// vocabulary; no remote image service or per-word image request is required.
const out = new URL("../public/illustrations/topics/", import.meta.url);
const palette = {
  people: ["#e7f6f1", "#fbdccf"], time: ["#e9f0fc", "#fee9bd"], home: ["#e8f6ef", "#f8d9c6"],
  food: ["#fff0dd", "#d9f3e6"], education: ["#e5f2ff", "#fee5bb"], travel: ["#dff3fa", "#fce5c8"],
  city: ["#e8eefc", "#d9f4ee"], nature: ["#dff5e6", "#fef0c9"], health: ["#e9f8f2", "#fce3df"],
  media: ["#eeeafd", "#fce7dc"], science: ["#e2f4f8", "#efe7fb"], technology: ["#e5efff", "#dff8f1"],
  business: ["#e6f5f2", "#fcebd5"], shopping: ["#fff0e7", "#e7effc"], art: ["#faeaf1", "#e9f4fd"],
  history: ["#f6eede", "#e5f0f3"], culture: ["#f9e9ea", "#fef0d2"], hobbies: ["#efeafd", "#dcf5ed"],
  language: ["#e9f5ff", "#fff0df"], goals: ["#e2f5ef", "#fbe8cf"], general: ["#e8f4f3", "#fff0de"],
};
const R = (x,y,w,h,fill,rx=8) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
const C = (x,y,r,fill) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const P = (d,fill,stroke="none",width=4) => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const L = (d,color="#345574",width=5) => P(d,"none",color,width);
const leaf = (x,y,color="#49aa87") => P(`M${x} ${y}q-25 -25 -35 5q23 14 35 -5Zm0 0q25 -28 37 -2q-17 20 -37 2Z`,color);
const face = (x,y) => `${C(x,y,21,"#f4c39e")}${P(`M${x-21} ${y-2}q-6 -28 20 -29q26 1 22 29q-15 -16 -42 0Z`,"#354966")}${C(x-7,y+2,2,"#354966")}${C(x+7,y+2,2,"#354966")}${L(`M${x-5} ${y+11}q5 5 11 0`,"#bc756c",2)}`;
const book = `${P("M151 154q42 -16 83 9v73q-42 -23 -83 -8Z","#ffffff","#396b86",4)}${P("M234 163q41 -25 83 -9v74q-42 -15 -83 8Z","#fff9ed","#396b86",4)}${L("M234 163v73 M165 178q28 -8 53 3 M250 181q26 -12 52 -9","#93aac0",3)}`;
const scenes = {
  people: `${face(198,102)}${face(279,102)}${P("M143 205q8 -70 55 -70t57 70Z","#42aaa4")}${P("M230 205q5 -70 50 -70t55 70Z","#ee8c80")}${C(239,181,10,"#ffdca2")}`,
  time: `${C(235,139,77,"#fff","#3e7390")}${L("M235 73v13 M235 192v13 M169 139h13 M288 139h13","#3e7390",4)}${L("M235 139V99 M235 139l31 20","#244767",8)}${C(235,139,5,"#f5b86b")}${R(309,81,45,70,"#f9c7ad",7)}`,
  home: `${P("M112 154l124 -91 130 91Z","#ef9b80")}${R(136,145,203,105,"#fffaf1",8)}${R(216,181,47,69,"#71b4aa",5)}${R(153,164,45,39,"#cdeefa",5)}${R(284,164,38,39,"#cdeefa",5)}${L("M112 154l124 -91 130 91","#45697d",5)}${leaf(360,226)}`,
  food: `${P("M138 181q95 85 190 0Z","#f7f9fc","#52768a",5)}${C(196,155,30,"#f6a154")}${C(239,141,36,"#e77665")}${C(281,158,29,"#f6d078")}${leaf(235,125)}${L("M124 205h230","#436b80",5)}`,
  education: `${book}${R(116,234,235,11,"#6ba7b0",5)}${P("M125 164l20 -51 18 51Z","#f3b567","#3e7390",3)}${R(336,140,20,94,"#e78983",4)}`,
  travel: `${P("M111 182l254 0-36 51H149Z","#4389a6")}${R(173,101,140,82,"#fff8ec",7)}${R(193,120,33,28,"#bce8f0",3)}${R(241,120,33,28,"#bce8f0",3)}${L("M235 101V68 M134 250q42 13 84 0t84 0 84 0","#6aa4b8",5)}${C(365,102,22,"#f8d274")}`,
  city: `${R(119,112,68,125,"#80b8bc",4)}${R(190,76,93,161,"#658cba",4)}${R(288,131,68,106,"#e6a079",4)}${[137,161,207,232,257,306,329].map(x=>R(x,151,12,13,"#fff3ca",2)).join("")}${L("M106 239h270","#58788b",5)}`,
  nature: `${C(358,87,27,"#ffd078")}${P("M91 219q67 -70 131 0q55 -95 155 0Z","#91cfac")}${P("M88 233q55 -50 121 0q85 -76 175 0Z","#4ba78e")}${L("M273 210v-92","#487d66",10)}${C(247,137,29,"#79c598")}${C(283,125,34,"#5db685")}${C(310,149,27,"#72c895")}`,
  health: `${R(134,96,200,139,"#fff",16)}${R(212,113,44,106,"#ee8585",5)}${R(180,144,108,44,"#ee8585",5)}${L("M113 226q38 -28 66 0t67 0 67 0 67 0","#58aaa6",6)}`,
  media: `${R(117,87,248,151,"#405d81",16)}${R(131,101,220,121,"#c9eaf2",7)}${P("M215 130l71 31-71 34Z","#ef8f83")}${R(184,244,115,8,"#5b7896",4)}${C(339,109,9,"#ffda88")}`,
  science: `${P("M195 69h74v13h-10v53l52 82q12 23 -7 28H160q-18 -5 -7 -28l53 -82V82h-11Z","#ffffff","#4a8196",5)}${P("M171 198q42 13 126 0l17 34H153Z","#73c6c8")}${C(207,179,10,"#fff")}${C(266,190,7,"#fff")}${C(347,99,14,"#f5bd77")}`,
  technology: `${R(112,91,248,144,"#4b678d",13)}${R(126,105,220,113,"#d6f5f0",5)}${P("M174 167l39 -37 35 24 54 -39","none","#44a9a1",7)}${C(302,115,7,"#ef9b80")}${R(175,235,121,10,"#7898ae",5)}`,
  business: `${R(130,144,208,91,"#fff8ec",6)}${R(198,107,73,38,"#739db8",6)}${L("M130 181h208 M211 107V95h46v12","#50718a",5)}${R(157,169,31,47,"#67b4a7",3)}${R(216,155,31,61,"#f4b979",3)}${R(275,138,31,78,"#e99384",3)}`,
  shopping: `${P("M155 125h173l-15 111H171Z","#fff","#577993",5)}${L("M187 129q0 -60 54 -60t54 60","#577993",7)}${R(185,165,111,11,"#f1b778",5)}${R(194,188,92,11,"#83c7b2",5)}`,
  art: `${R(143,83,191,157,"#c58f6d",6)}${R(155,95,167,133,"#fff5e7",4)}${C(238,142,31,"#ffd584")}${P("M164 211l56 -57 39 35 34 -28 22 50Z","#84bdac")}${L("M133 241h210","#856f72",5)}`,
  history: `${P("M121 118l114 -51 115 51Z","#dcaf82")}${[147,198,249,300].map(x=>`${R(x,121,24,111,"#fff3df",3)}${R(x-5,120,34,8,"#8b9ca2",2)}`).join("")}${R(113,232,246,12,"#b78670",3)}${C(371,87,18,"#e6c982")}`,
  culture: `${P("M147 150q43 -30 85 0q-8 55 -42 62q-37 -8 -43 -62Z","#f4b07c")}${P("M239 150q43 -30 85 0q-6 54 -42 62q-36 -7 -43 -62Z","#8abdc0")}${C(174,166,4,"#5e5572")}${C(208,166,4,"#5e5572")}${C(266,166,4,"#5e5572")}${C(300,166,4,"#5e5572")}${L("M176 185q16 14 33 0 M263 191q19 -14 37 0","#5e5572",3)}`,
  hobbies: `${C(228,155,74,"#fff","#6d98ac")}${C(228,155,49,"#f7d89b")}${L("M180 156h96 M228 107v96","#85b5a7",4)}${P("M307 99l36 14-20 51-36-14Z","#f19d89")}${L("M309 98l-5 -24","#577a8d",4)}`,
  language: `${R(112,96,156,106,"#fff",18)}${P("M144 197l-18 29 4 -36Z","#fff")}${R(228,133,135,91,"#79bec5",18)}${P("M328 213l24 25-4-31Z","#79bec5")}${C(156,148,7,"#6a9fb2")}${C(188,148,7,"#6a9fb2")}${C(220,148,7,"#6a9fb2")}${L("M254 176h79","#fff",5)}`,
  goals: `${C(236,149,86,"#fff","#5a9aa0")}${C(236,149,58,"#f8dbaa")}${C(236,149,29,"#fff")}${C(236,149,8,"#ef9189")}${L("M282 104l43-43 M319 62l14 1-1 14","#586b85",7)}`,
  general: `${book}${C(339,87,22,"#f8ca77")}${leaf(113,216)}`,
};
await mkdir(out, { recursive: true });
for (const [name, drawing] of Object.entries(scenes)) {
  const [a,b] = palette[name];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300" role="img" aria-label="${name}"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>${R(0,0,480,300,"url(#bg)",24)}${C(51,58,25,"#ffffff88")}${C(427,218,37,"#ffffff55")}${P("M0 263q105 -26 220 0t260 0v37H0Z","#ffffff55")}${drawing}</svg>`;
  await writeFile(new URL(`${name}.svg`, out), svg);
}
console.log(`Built ${Object.keys(scenes).length} topic illustrations`);
