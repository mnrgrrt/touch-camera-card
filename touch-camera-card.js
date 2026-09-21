// touch-camera-card
//
// One Lovelace card with its own tabs for cameras, built for touch panels and
// Google Nest Hub cast dashboards (1024x600). Everything is set from the dashboard
// editor - tabs, cameras per tab, the general settings - so there is no need to go
// into the YAML. The code editor keeps working and stays authoritative for keys the
// form does not know about.
//
// The machinery follows a contract that was settled on measurements, not on taste:
//
//   tiles       separate snapshots         nothing that can break, recovers by itself
//   large view  MJPEG stream from HA       22 ms to first frame, no decoder, no buffer
//               + watchdog                  a stalled stream looks exactly like a scene
//                                          that is not moving; that trap is closed here
//   clip        notifications mp4          2 to 3 seconds, plays everywhere
//
// What is deliberately NOT in here any more: advanced-camera-card, webrtc-camera,
// the Home Assistant player, go2rtc in the card's path, MSE, WebRTC, user-agent
// sniffing and remembering which mode worked. That whole layer existed to get an
// H.264 stream running on a device that is bad at it. That question is gone.
//
// Colours come from the Home Assistant theme variables, with a luminance test to
// tell light from dark. Deliberately not prefers-color-scheme: on a cast Nest Hub
// that does not follow the HA theme, and that was the cause of the unreadable
// navigation in light mode.

const CSS = `
:host { display:block; }
* { box-sizing:border-box; }
button { background:none; border:0; padding:0; font:inherit; color:inherit;
         cursor:pointer; -webkit-tap-highlight-color:transparent; text-align:left; }

.laag {
  --ov1:rgba(255,255,255,.05);
  --ov2:rgba(255,255,255,.09);
  --line:rgba(255,255,255,.07);
  --zacht:rgba(255,255,255,.55);
  --flauw:rgba(255,255,255,.34);
  --acc:#4aa3ff;
  --waarschuw:#ffc14d;
  --alarm:#ff4d4d;
  --tekst:var(--primary-text-color,#e9e9ea);
  position:relative; height:var(--cc-h,540px); display:flex; flex-direction:column;
  gap:12px; overflow:hidden; padding:16px 18px; border-radius:20px;
  background:var(--ha-card-background, var(--card-background-color, #1c1c1e));
  font-family:var(--primary-font-family,sans-serif);
  color:var(--tekst); font-size:14px;
}
/* Bare: one camera and nothing around it, for use as a single tile on a dashboard
   among other cards. No tab bar, no notifications column, no padding and no
   background of its own - the tile fills the card and takes its rounding from it.
   The timer and the watchdog stay, which is the whole point of using this instead
   of a picture card. */
.laag.kaal { padding:0; border-radius:0; background:none; gap:0; height:auto; }
.laag.kaal .blad { gap:0; }
.laag.kaal .kolom { width:100%; height:auto; }
.laag.kaal .tegel { width:100%; height:auto;
                    border-radius:var(--cc-r,20px); box-shadow:none; }
/* The ring has to sit on top of the image: an inset shadow on the tile itself is
   painted underneath it and stays invisible. */
.laag.kaal .tegel::after { content:''; position:absolute; inset:0; pointer-events:none;
                           border-radius:inherit; box-shadow:inset 0 0 0 0 transparent;
                           transition:box-shadow .35s ease; }
.laag.kaal .tegel.beweging::after { box-shadow:inset 0 0 0 var(--cc-rand,7px) var(--waarschuw); }
.laag.kaal .tegel.persoon::after  { box-shadow:inset 0 0 0 var(--cc-rand,7px) var(--alarm); }

/* Grey until it matters. A still scene in grey is easy to ignore, and the moment a
   person is seen the colour returning draws the eye harder than any border does. */
.laag.grijs .tegel:not(.weertegel) img { filter:grayscale(1); transition:filter .5s ease; }
.laag.grijs .tegel.persoon:not(.weertegel) img { filter:none; }
.laag.kaal .label { font-size:13px; }

/* Light themes get dark overlays. Which of the two it is gets read from the actual
      background colour - not asked of the device. */
.laag.licht {
  --ov1:rgba(0,0,0,.04); --ov2:rgba(0,0,0,.07); --line:rgba(0,0,0,.08);
  --zacht:rgba(0,0,0,.6); --flauw:rgba(0,0,0,.42);
}

/* tabs: underline instead of pills */
.tabs { display:flex; gap:20px; flex-wrap:nowrap; min-width:0; max-width:100%;
        border-bottom:1px solid var(--line); flex:0 0 auto; overflow:hidden; }
.tabs button { height:34px; font-size:13.5px; font-weight:600; color:var(--flauw);
               display:flex; align-items:center; gap:7px; border-bottom:2px solid transparent;
               margin-bottom:-1px; white-space:nowrap; }
.tabs button.on { color:var(--tekst); border-bottom-color:var(--acc); }
.tabs ha-icon { --mdc-icon-size:17px; }
.tabs button.on ha-icon { color:var(--acc); }
.tabs .telling { margin-left:auto; font-size:11.5px; font-weight:500;
                 color:var(--flauw); align-self:center; }

.blad { flex:1 1 auto; min-height:0; display:flex; gap:12px; }

/* Height leads, 16:9 decides the width. That way nothing is ever cropped.
      Both columns use the same gap (--gat). That is exactly the condition that makes
      one large tile as tall as two small ones plus the space between them: with an
      equal gap the arithmetic lines up. */
.kolom { display:flex; flex-direction:column; flex:0 0 auto; min-height:0; height:100%;
         gap:var(--gat,8px); }
.hoofd .tegel { height:calc((100% - (var(--ng,2) - 1) * var(--gat,8px)) / var(--ng,2) * var(--beeld,1));
                width:auto; }
.overig .tegel { height:calc((100% - (var(--no,4) - 1) * var(--gat,8px)) / var(--no,4) * var(--beeld,1));
                 width:auto; }

.tegel { position:relative; border-radius:10px; overflow:hidden; background:var(--ov1);
         box-shadow:0 4px 12px rgba(0,0,0,.3); aspect-ratio:var(--vh,16/9); flex:0 0 auto; }
.tegel img { width:100%; height:100%; object-fit:cover; display:block; }
/* Not every image is a camera: a rain radar is nearly square and you want to see
      all of it, not cropped to a widescreen strip. */
.tegel.vrij img { object-fit:contain; }
.tegel.beweging { box-shadow:0 0 0 2px var(--waarschuw), 0 4px 12px rgba(0,0,0,.3); }
.tegel.persoon  { box-shadow:0 0 0 3px var(--alarm), 0 4px 12px rgba(0,0,0,.3); }

.label { position:absolute; left:0; right:0; bottom:0; padding:16px 10px 7px;
         font-size:12px; font-weight:600; color:#fff; white-space:nowrap;
         overflow:hidden; text-overflow:ellipsis;
         background:linear-gradient(to top,rgba(0,0,0,.65),transparent); }
.overig .label { font-size:11px; padding:12px 8px 5px; }

.stip { position:absolute; top:8px; right:8px; width:9px; height:9px; min-width:9px;
        max-width:9px; max-height:9px; border-radius:999px;
        background:var(--waarschuw); box-shadow:0 0 0 3px rgba(0,0,0,.3); }
.tegel.persoon .stip, .mini.persoon .stip { background:var(--alarm); }

/* grid: the small tiles spread across all the remaining space. */
/* The lower bound keeps the small tiles usable. Without it a narrow box - the
      preview in the card editor - squeezed this column flat to a sliver, because the
      large image takes its width from its height and so never yields. Now the whole
      thing would rather overflow, and _pasSchaal() scales the card down. */
.overig.raster { display:grid; flex:1 1 auto; height:100%;
                 min-width:calc(var(--kk,2) * 130px + (var(--kk,2) - 1) * var(--gat,8px));
                 grid-template-columns:repeat(var(--kk,2),1fr);
                 grid-auto-rows:1fr; gap:var(--gat,8px); }
.overig.raster .tegel { width:auto; height:auto; aspect-ratio:auto;
                        min-width:0; min-height:0; }

/* Weather image: a map underlay with a running precipitation layer on top. */
.weertegel { background:#0b1a2b; }
.wkaart { position:absolute; top:0; left:0; right:0; bottom:0; overflow:hidden; }
/* The map area keeps its own aspect ratio and is grown until it fills the tile;
      whatever falls outside the tile is cut off. Otherwise a wide, low tile turned
      into a stretched smear. */
.wveld { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
         width:100%; height:100%; }
.wbasis, .wnamen { position:absolute; top:0; left:0; right:0; bottom:0;
                   display:grid; grid-template-columns:repeat(var(--wx,4),1fr);
                   grid-template-rows:repeat(var(--wy,4),1fr); }
.wbasis img, .wnamen img { width:100%; height:100%; display:block; }
.wnamen { pointer-events:none; }
.wlaag { position:absolute; top:0; left:0; width:100%; height:100%;
         display:block; }
.w24 .wkaart img { position:absolute; top:0; left:0; width:100%; height:100%;
                   object-fit:cover; display:block; }
.wtijd { position:absolute; top:6px; left:8px; padding:2px 7px; border-radius:6px;
         background:rgba(0,0,0,.55); color:#fff; font-size:11px; font-weight:600;
         letter-spacing:.02em; }
.wbezig { position:absolute; top:6px; right:8px; padding:2px 7px; border-radius:6px;
          background:rgba(0,0,0,.45); color:#fff; font-size:11px; }

/* A tile can also hold an ordinary Lovelace card. */
.tegel.kaartje { background:var(--ha-card-background, var(--card-background-color, #1c1c1e)); }
.kaartvak { position:absolute; top:0; left:0; right:0; bottom:0; overflow:hidden;
            pointer-events:none; }
.kaartvak > * { display:block; width:100%; height:100%; }
.kaartvak ha-card { height:100%; box-shadow:none; border:none; border-radius:10px;
                    background:transparent; }

.leeg { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center;
        justify-content:center; gap:5px; color:var(--flauw); }
.leeg ha-icon { --mdc-icon-size:22px; }
.leeg span { font-size:11px; }

/* notifications: far right, takes the remaining width */
.mkol { display:flex; flex-direction:column; min-height:0; flex:1 1 auto; gap:8px;
        /* Never narrower than a thumbnail plus a line of text. Without a lower bound
           the tiles could squeeze this column to nothing and the notifications simply
           disappeared; now the card would rather overflow, which _pasSchaal() handles. */
        min-width:calc(var(--mb,200px) + 96px); }
.mkop { display:flex; align-items:baseline; flex:0 0 auto;
        padding-bottom:7px; border-bottom:1px solid var(--line); }
.mkop b { font-size:12.5px; font-weight:600; color:var(--tekst); }
.mkop span { font-size:11px; color:var(--flauw); margin-left:auto; }

.scrollbox { flex:1; min-height:0; max-width:100%; display:grid;
             grid-template-columns:minmax(0,1fr) 34px; gap:4px; margin-top:4px; }
.mlijst { min-height:0; overflow-y:auto; scrollbar-width:none;
          display:flex; flex-direction:column; gap:7px; }
.mlijst::-webkit-scrollbar { display:none; }
.pijlen { display:flex; flex-direction:column; gap:4px; min-height:0; }
.pijlen button { flex:0 0 44px; border-radius:8px; background:var(--ov1); color:var(--flauw);
                 display:flex; align-items:center; justify-content:center; }
.pijlen button[disabled] { opacity:.3; }
.pijlen ha-icon { --mdc-icon-size:22px; }
.rail { flex:1 1 0; min-height:20px; width:100%; margin:2px 0; position:relative;
        opacity:0; transition:opacity .2s; }
.rail.aan { opacity:1; }
.rail::before { content:''; position:absolute; top:0; bottom:0; left:50%; width:6px;
        margin-left:-3px; border-radius:999px; background:var(--ov1); }
.duim { position:absolute; left:50%; width:12px; margin-left:-6px; top:0; height:20%;
        border-radius:999px; background:var(--flauw);
        transition:top .12s linear, height .12s linear; }

.melding { display:grid; grid-template-columns:var(--mb,200px) minmax(0,1fr); gap:11px;
           align-items:center; border-radius:9px; padding:4px; }
.melding:hover { background:var(--ov1); }
.melding img { width:100%; aspect-ratio:16/9; object-fit:cover;
               border-radius:7px; display:block; background:var(--ov1); }
.mtxt { min-width:0; }
.mtxt .b1 { font-size:13px; font-weight:600; color:var(--tekst);
            white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.mtxt .b2 { font-size:11.5px; color:var(--flauw); margin-top:3px;
            white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.mleeg { font-size:12px; color:var(--flauw); padding-top:6px; }

/* detail */
.detail { flex:1 1 auto; min-height:0; display:flex; flex-direction:column; gap:11px; }
.dkop { display:flex; align-items:center; gap:12px; flex:0 0 auto; }
.terug { display:flex; align-items:center; gap:6px; height:32px; padding:0 13px; border-radius:9px;
         background:var(--ov1); color:var(--zacht); font-size:13px; font-weight:600; }
.terug ha-icon { --mdc-icon-size:18px; }
.dnaam { font-size:15px; font-weight:600; color:var(--tekst); }
.dnoot { display:flex; align-items:center; gap:6px; margin-left:auto;
         font-size:11.5px; color:var(--flauw); min-width:0; overflow:hidden;
         white-space:nowrap; text-overflow:ellipsis; }
.dnoot i { width:7px; height:7px; min-width:7px; max-width:7px; max-height:7px;
           border-radius:999px; background:var(--acc); font-style:normal; }
.dnoot.terugval i { background:var(--waarschuw); }

.dlijf { flex:1 1 auto; min-height:0; display:flex; gap:12px; }

/* Height leads, 16:9 decides the width: no black bars. The snapshot sits ready as
      the background, so there is always an image. */
.speler { height:100%; width:auto; aspect-ratio:16/9; flex:0 0 auto; min-width:0;
          border-radius:11px; overflow:hidden; position:relative; background:#000; }
.speler > img, .speler > video { position:absolute; top:0; left:0;
          width:100%; height:100%; object-fit:contain; display:block; }
.speler .stil { z-index:2; }
.speler .meet { position:absolute; left:0; right:0; top:0; z-index:5;
                padding:4px 9px; font-size:11px; line-height:1.4; color:#fff;
                background:rgba(0,0,0,.6); font-variant-numeric:tabular-nums;
                pointer-events:none; }
.speler .bezig { position:absolute; left:10px; bottom:9px; z-index:3;
                 padding:3px 9px; border-radius:999px; font-size:11px;
                 color:#fff; background:rgba(0,0,0,.45); }
.speler .mis { position:absolute; left:0; right:0; bottom:0; z-index:4;
               padding:9px 12px; font-size:12px; color:#fff;
               background:linear-gradient(to top,rgba(0,0,0,.8),transparent); }

/* The clip gets a screen of its own: as bare as possible, outside the flex chain. */
.clipscherm { position:absolute; inset:0; z-index:20; padding:16px 18px;
              background:var(--ha-card-background, var(--card-background-color, #1c1c1e)); }
.ckop { display:flex; align-items:center; gap:12px; height:34px; }
.cvak { position:relative; margin:12px auto 0; background:#000; overflow:hidden; }
.cvak > video, .cvak > img { position:absolute; top:0; left:0;
              width:100%; height:100%; object-fit:contain; display:block; }
.cvak .bezig { position:absolute; left:10px; bottom:9px; z-index:3;
               padding:3px 9px; border-radius:999px; font-size:11px;
               color:#fff; background:rgba(0,0,0,.45); }
.cvak .mis { position:absolute; left:0; right:0; bottom:0; z-index:4;
             padding:9px 12px; font-size:12px; color:#fff;
             background:linear-gradient(to top,rgba(0,0,0,.8),transparent); }

.zijkolom { display:flex; flex-direction:column; gap:var(--gat,8px); flex:1 1 auto;
            align-items:center; min-width:0; height:100%;
            overflow-y:auto; scrollbar-width:none; }
.zijkolom::-webkit-scrollbar { display:none; }
.mini { flex:0 0 auto; height:calc((100% - (var(--nd,5) - 1) * var(--gat,8px)) / var(--nd,5));
        width:auto; aspect-ratio:16/9; border-radius:8px; overflow:hidden;
        background:var(--ov1); position:relative; }
.mini img { width:100%; height:100%; object-fit:cover; display:block; }
.mini .dlabel { position:absolute; left:0; right:0; bottom:0; padding:12px 7px 4px;
                font-size:10.5px; font-weight:600; color:#fff; white-space:nowrap;
                overflow:hidden; text-overflow:ellipsis;
                background:linear-gradient(to top,rgba(0,0,0,.65),transparent); }
.mini.beweging { box-shadow:0 0 0 2px var(--waarschuw); }
.mini.persoon  { box-shadow:0 0 0 2px var(--alarm); }
`;

const SEC = 1000;

// The configuration keys are English. The Dutch names this card was first written
// with keep working, so existing dashboards do not have to be rewritten. Anything
// coming in is translated to the internal names; anything the editor writes back
// goes out in English, so a saved configuration ends up in one single spelling.
const SLEUTELS = {
  name: 'naam',
  swap: 'wisselen',
  grid: 'raster',
  notifications: 'meldingen',
  large: 'groot',
  crop: 'bijsnijden',
  ratio: 'verhouding',
  refresh: 'ververs',
  motion: 'beweging',
  person: 'persoon',
  card: 'kaart',
  weather: 'weer',
  speed: 'tempo',
  fill: 'vullen',
  height: 'hoogte',
  fill_margin: 'vul_marge',
  stream: 'stroom',
  large_refresh: 'groot_ververs',
  stalled_after: 'stil_na',
  clip_timeout: 'clip_wacht',
  clip_loop: 'clip_herhalen',
  notification_count: 'meldingen_aantal',
  notifications_per_camera: 'meldingen_per_camera',
  notification_width: 'melding_breedte',
  bare: 'kaal',
  navigate: 'navigeren',
  radius: 'rondte',
  ring: 'rand',
  grayscale: 'grijs',
  hours: 'uren',
  place: 'plaats',
  latitude: 'breedte',
  longitude: 'lengte',
};

const SLEUTELS_TERUG = Object.keys(SLEUTELS).reduce((o, k) => {
  o[SLEUTELS[k]] = k;
  return o;
}, {});

/* The few words the card puts on screen itself. English is the fallback for every
   language that is not Dutch, so a new translation is one more block below. */
const TEKST = {
  en: {
    signal: 'no signal',
    notifications: 'Notifications',
    today: 'today',
    nothing: 'Nothing yet today',
    loading: 'loading',
    offline: 'unreachable',
    noimage: 'no image',
    back: 'Back',
    connecting: 'connecting…',
    live: 'live',
    snapshots: 'snapshots',
    nosource: 'no source',
    nostart: 'stream did not start',
    stalled: 'stream stalled',
    norecording: 'notification without a recording of its own',
    nofetch: 'the recording could not be fetched',
    fetching: 'fetching the recording…',
    event: 'event',
    person: 'person',
    motion: 'motion',
    nosignal: 'without signal',
    notabs: 'No tabs yet. Add one to choose cameras.',
    nocams: 'No cameras on this tab yet.',
    nocam: 'no camera chosen yet',
    radarsrc: 'radar: ',
    now: 'now',
    noplace: 'place not found',
    hourshort: 'h',
    tabs: 'Tabs',
    tab: 'Tab',
    general: 'General settings',
    addtab: 'Tab',
    deltab: 'Delete tab',
    moveleft: 'Move left',
    moveright: 'Move right',
    camsontab: 'Cameras on this tab',
    addcam: 'Add camera',
    big: 'large',
    moveup: 'Up',
    movedown: 'Down',
    delcam: 'Delete camera',
    owncard: 'a card of your own',
    late: (s) => 'the recording did not arrive within ' + s + ' seconds',
  },
  nl: {
    signal: 'geen signaal',
    notifications: 'Meldingen',
    today: 'vandaag',
    nothing: 'Nog niets vandaag',
    loading: 'laden',
    offline: 'niet bereikbaar',
    noimage: 'geen beeld',
    back: 'Terug',
    connecting: 'verbinden…',
    live: 'live',
    snapshots: 'momentopnames',
    nosource: 'geen bron',
    nostart: 'stroom kwam niet op gang',
    stalled: 'stroom viel stil',
    norecording: 'melding zonder herkenbare opname',
    nofetch: 'opname niet op te halen',
    fetching: 'opname ophalen…',
    event: 'gebeurtenis',
    person: 'persoon',
    motion: 'beweging',
    nosignal: 'zonder signaal',
    notabs: 'Nog geen tabbladen. Voeg er een toe om camera’s te kiezen.',
    nocams: 'Nog geen camera’s op dit tabblad.',
    nocam: 'nog geen camera gekozen',
    radarsrc: 'weerbeeld: ',
    now: 'nu',
    noplace: 'plaats niet gevonden',
    hourshort: 'u',
    tabs: 'Tabbladen',
    tab: 'Tabblad',
    general: 'Algemene instellingen',
    addtab: 'Tabblad',
    deltab: 'Tabblad verwijderen',
    moveleft: 'Naar links',
    moveright: 'Naar rechts',
    camsontab: 'Camera’s op dit tabblad',
    addcam: 'Camera toevoegen',
    big: 'groot',
    moveup: 'Omhoog',
    movedown: 'Omlaag',
    delcam: 'Camera verwijderen',
    owncard: 'eigen kaart',
    late: (s) => 'opname kwam niet binnen ' + s + ' seconden',
  },
};

function ctcT(taal, sleutel, arg) {
  const T = TEKST[taal] || TEKST.en;
  const v = (T[sleutel] !== undefined ? T[sleutel] : TEKST.en[sleutel]);
  return typeof v === 'function' ? v(arg) : (v === undefined ? sleutel : v);
}

function ctcHernoem(o, map) {
  if (!o || typeof o !== 'object') return o;
  const uit = {};
  Object.keys(o).forEach((k) => { uit[map[k] || k] = o[k]; });
  return uit;
}

// Only the three levels this card knows about: the card itself, its tabs and the
// cameras in them. Never inside 'card': that holds somebody else's Lovelace
// configuration and is passed through untouched.
function ctcSleutels(cfg, map) {
  if (!cfg || typeof cfg !== 'object') return cfg;
  const uit = ctcHernoem(cfg, map);
  if (Array.isArray(uit.tabs)) {
    uit.tabs = uit.tabs.map((t) => {
      const tab = ctcHernoem(t, map);
      if (Array.isArray(tab.cameras)) tab.cameras = tab.cameras.map((c) => ctcHernoem(c, map));
      return tab;
    });
  }
  return uit;
}

class TouchCameraCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._tab = 0;
    this._open = null;      // entity of the camera shown large
    this._clip = null;
    this._meldingen = [];
    this._laatstBeeld = {};
    this._timers = [];
  }

  setConfig(config) {
    config = ctcSleutels(config, SLEUTELS);
    if (!config || !Array.isArray(config.tabs) || !config.tabs.length) {
      throw new Error('touch-camera-card: "tabs" is missing');
    }
    this._cfg = Object.assign({
      ververs: 1,             // seconds between snapshots (can be overridden per camera)
      groot_ververs: 0.5,     // snapshot rate in the large view after a fallback
      stroom: true,           // large view as a continuous MJPEG stream
      stil_na: 6,             // seconds without a new frame before the watchdog steps in
      clip_wacht: 20,
      meldingen_aantal: 20,
      meldingen_per_camera: 8,
    }, config);
    this._tab = 0;
    this._gekozen = {};
    this._gebouwd = false;
    if (this.shadowRoot) this.shadowRoot.innerHTML = '';
  }

  getCardSize() { return 12; }

  static getConfigElement() {
    return document.createElement('touch-camera-card-editor');
  }

  static getStubConfig(hass) {
    const cam = Object.keys((hass && hass.states) || {}).find(e => e.startsWith('camera.'));
    return { tabs: [{ name: 'Cameras', icon: 'mdi:cctv', cameras: cam ? [{ name: 'Camera', entity: cam, large: true }] : [] }] };
  }

  set hass(h) {
    this._hass = h;
    if (!this._gebouwd) { this._bouw(); return; }
    this._ververs();
  }

  connectedCallback() {
    if (this._gebouwd) this._hervat();
    // If the card gets wider or narrower, fit it again. React to width only: the
    // height changes because of the scaling itself, and following that would give
    // an endless loop.
    if (!this._maatkijker && window.ResizeObserver) {
      this._maatkijker = new ResizeObserver(() => {
        const b = Math.round(this.clientWidth);
        if (b === this._breedte) return;
        this._breedte = b;
        this._kap = 0;
        this._kapRonde = 0;
        this._vulHoogte();
        this._pasSchaal();
      });
      this._maatkijker.observe(this);
    }
  }
  disconnectedCallback() {
    this._stopAlles();
    if (this._maatkijker) { this._maatkijker.disconnect(); this._maatkijker = null; }
  }

  // ---------- small helpers ----------

  _cams() { return (this._cfg.tabs[this._tab] || {}).cameras || []; }
  // A tile without a camera (its own Lovelace card) has no entity, so it gets its
  // position in the list as its key.
  _tsleutel(cam) { return cam.entity || ('kaart:' + this._cams().indexOf(cam)); }
  _cam(e) {
    const cams = this._cams();
    for (let i = 0; i < cams.length; i++) {
      if ((cams[i].entity || ('kaart:' + i)) === e) return cams[i];
    }
    return null;
  }
  _st(e) { return this._hass && this._hass.states ? this._hass.states[e] : null; }

  _leeft(cam) {
    const s = this._st(cam.entity);
    if (!s || s.state === 'unavailable' || s.state === 'unknown') return false;
    return !!s.attributes.entity_picture;
  }

  _aan(entity) {
    if (!entity) return false;
    const s = this._st(entity);
    return !!s && s.state === 'on';
  }

  _niveau(cam) {
    if (this._aan(cam.persoon)) return 'persoon';
    if (this._aan(cam.beweging) || this._aan(cam.occupancy)) return 'beweging';
    return '';
  }

  _plaatje(cam) {
    const s = this._st(cam.entity);
    return (s && s.attributes && s.attributes.entity_picture) || '';
  }

  _snap(cam, t) {
    const p = this._plaatje(cam);
    return p ? p + '&_t=' + (t || Date.now()) : '';
  }

  // Home Assistant also serves the same camera as a continuous MJPEG stream. One
  // <img>, nothing else: no MediaSource, no WebRTC, no video decoder.
  _stroomUrl(cam) {
    const p = this._plaatje(cam);
    return p ? p.replace('/api/camera_proxy/', '/api/camera_proxy_stream/') : '';
  }

  _tempo(cam) {
    const v = cam && cam.ververs != null ? cam.ververs : this._cfg.ververs;
    return Math.max(v == null ? 1 : v, 0.2) * SEC;
  }

  // ---------- theme ----------

  // Read from the actual background colour whether this is a light or a dark theme.
  // That also works on a cast dashboard, where prefers-color-scheme says nothing.
  _pasThemaToe() {
    if (!this._laag) return;
    const s = getComputedStyle(this._laag);
    const kleur = s.backgroundColor || '';
    if (kleur === this._themaKleur) return;
    this._themaKleur = kleur;
    const m = kleur.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (!m) return;
    const lum = (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255;
    this._laag.classList.toggle('licht', lum > 0.5);
  }

  // ---------- building up ----------

  _bouw() {
    if (!this._hass) return;
    this._gebouwd = true;
    const c = this._cfg;
    this.shadowRoot.innerHTML = '<style>' + CSS + '</style><div class="laag'
      + (c.kaal ? ' kaal' : '') + (c.grijs ? ' grijs' : '') + '"></div>';
    this._laag = this.shadowRoot.querySelector('.laag');
    if (c.rondte != null) this.style.setProperty('--cc-r', c.rondte + 'px');
    if (c.rand != null) this.style.setProperty('--cc-rand', c.rand + 'px');
    if (c.hoogte) this.style.setProperty('--cc-h', c.hoogte + 'px');
    if (c.accent) this.style.setProperty('--acc', c.accent);
    if (c.melding_breedte) this.style.setProperty('--mb', c.melding_breedte + 'px');
    if (c.beeld_schaal) this.style.setProperty('--beeld', String(c.beeld_schaal));
    if (c.tussenruimte != null) this.style.setProperty('--gat', c.tussenruimte + 'px');
    this._pasThemaToe();
    this._teken();
    this._haalMeldingen();
    this._hervat();
  }

  // One clock for everything: refreshing snapshots, updating status colours and
  // fetching the notification list now and then. It stops when the card detaches.
  _hervat() {
    this._stopKlok();
    this._timers.push(setInterval(() => this._verversBeelden(), 250));
    this._timers.push(setInterval(() => this._haalMeldingen(), 30 * SEC));
    this._vulHoogte();
  }

  _stopKlok() {
    this._timers.forEach(t => clearInterval(t));
    this._timers = [];
  }

  _stopAlles() {
    this._stopKlok();
    this._stopStroom();
    this._stopClip();
    this._stopWeer();
  }

  _stopWeer() {
    (this._weerLopers || []).forEach(l => clearInterval(l));
    this._weerLopers = [];
  }

  // Measure against the document, not against the window. Otherwise the measured top
  // changes as soon as the page scrolls a little, the card grows because of it, the
  // page gets longer because of that, and it scrolls further - a loop that keeps
  // growing the card and pushes the badges out of view. And only write when the
  // outcome really changes: every write is another layout pass.
  // All sizes follow from the height: the tiles are as wide as their ratio asks at
  // that height. In a narrow box - the preview in the card editor, or a phone - that
  // does not fit across, and the right-hand side fell outside the view. Better to
  // scale the whole thing down than to cut it off.
  _pasSchaal() {
    const l = this._laag;
    if (!l) return;
    l.style.zoom = '';
    this._zetBreedtes();
    const heb = l.clientWidth;
    const nodig = l.scrollWidth;
    if (heb > 0 && nodig > heb + 2) {
      // Filling the screen, the height is the card's own choice. Then give up some
      // height rather than shrink everything and leave an empty strip below.
      if (this._cfg.vullen && this._hoogte && (this._kapRonde || 0) < 4) {
        this._kapRonde = (this._kapRonde || 0) + 1;
        this._kap = Math.max(260, Math.floor(this._hoogte * heb / nodig));
        this._vulHoogte();
        return;
      }
      // With a notifications column present, pull back a little further than strictly
      // needed, so that column keeps a readable width. Without it, go ahead and fill.
      const ruim = l.querySelector('.mkol') ? 0.75 : 0.97;
      l.style.zoom = String(Math.max(0.3, (heb / nodig) * ruim));
    }
    this._alleWeerPassend();
  }

  _vulHoogte() {
    if (!this._cfg.vullen || !this._laag) return;
    const top = this.getBoundingClientRect().top + (window.scrollY || 0);
    const marge = this._cfg.vul_marge == null ? 24 : this._cfg.vul_marge;
    let h = Math.max(260, Math.round(window.innerHeight - top - marge));
    if (this._kap) h = Math.min(h, this._kap);
    if (h === this._hoogte) return;
    this._hoogte = h;
    this.style.setProperty('--cc-h', h + 'px');
    this._pasSchaal();
  }

  // Sizes worked out here instead of left to the browser. Chrome resolves a
  // percentage height inside a flexed box and turns it, with aspect-ratio, into the
  // right width. Safari 15 - an iPad that stopped at iPadOS 15, and every browser on
  // it - treats that height as unknown: tiles came out zero wide, columns collapsed
  // and images stacked on top of each other. So: take the height the row really got,
  // divide it over the tiles, derive every width from it, and write it all in pixels.
  // Then every browser draws the same thing.
  _zetBreedtes() {
    const l = this._laag;
    if (!l) return;
    const cs = getComputedStyle(l);
    const gat = parseFloat(cs.getPropertyValue('--gat')) || 8;
    const beeld = parseFloat(cs.getPropertyValue('--beeld')) || 1;
    const verhouding = (el) => {
      const v = (el.style.getPropertyValue('--vh') || '').trim();
      const m = v.match(/^([\d.]+)\s*\/\s*([\d.]+)$/);
      return (m && +m[2]) ? +m[1] / +m[2] : 16 / 9;
    };
    const blad = l.querySelector('.blad');
    const H = blad ? blad.clientHeight : 0;
    if (H) {
      Array.prototype.forEach.call(blad.children, (k) => {
        if (!k.classList.contains('kolom')) return;
        k.style.height = H + 'px';
        if (k.classList.contains('raster')) return;
        const tegels = Array.prototype.filter.call(k.children, (e) => e.classList.contains('tegel'));
        if (!tegels.length) return;
        const h = Math.floor((H - (tegels.length - 1) * gat) / tegels.length * beeld);
        let breed = 0;
        tegels.forEach((t) => {
          const w = Math.round(h * verhouding(t));
          t.style.height = h + 'px';
          t.style.width = w + 'px';
          breed = Math.max(breed, w);
        });
        k.style.width = breed + 'px';
      });
    }
    const lijf = l.querySelector('.dlijf');
    const D = lijf ? lijf.clientHeight : 0;
    if (D) {
      const sp = lijf.querySelector('.speler');
      if (sp) {
        sp.style.height = D + 'px';
        sp.style.width = Math.round(D * 16 / 9) + 'px';
      }
      const zk = lijf.querySelector('.zijkolom');
      if (zk) {
        zk.style.height = D + 'px';
        const minis = zk.querySelectorAll('.mini');
        const n = Math.max(minis.length, 1);
        const h = Math.floor((D - (n - 1) * gat) / n);
        minis.forEach((m) => {
          m.style.height = h + 'px';
          m.style.width = Math.round(h * 16 / 9) + 'px';
        });
      }
    }
  }

  // Only redraw when something about the structure really changes. Otherwise
  // everything flickers and the scroll position jumps while nothing happened.
  _vingerafdruk() {
    // If a clip or a large view is open, only that counts. Otherwise a camera that
    // drops out for a moment would rebuild the whole view - and with it restart a
    // running recording or stream in the middle of playback. The status colours keep
    // being updated in the meantime.
    if (this._clip) return 'clip|' + (this._clip.url || '') + '|' + (this._clip.mis || '');
    if (this._open) return 'detail|' + this._tab + '|' + this._open;
    return ['overzicht', this._tab,
      this._cams().map(c => this._leeft(c) ? '1' : '0').join('')].join('|');
  }

  _ververs() {
    this._pasThemaToe();
    const nu = this._vingerafdruk();
    if (nu !== this._sleutel) { this._sleutel = nu; this._teken(); }
    else { this._verversStatus(); }
    (this._kaartEls || []).forEach(el => { el.hass = this._hass; });
    this._vulHoogte();
  }

  _teken() {
    // Undo any scaling from the previous round first, otherwise _pasSchaal() will
    // measure the already shrunken sizes.
    if (this._laag) this._laag.style.zoom = '';
    this._kap = 0;
    this._kapRonde = 0;
    this._sleutel = this._vingerafdruk();
    if (this._clip) this._tekenClip();
    else if (this._open) this._tekenDetail();
    else this._tekenOverzicht();
  }

  // ---------- snapshots ----------

  // Fetch the new snapshot first and only then swap it in, otherwise the tile is
  // briefly empty and flickers every round. But never keep waiting for that signal:
  // on a Nest Hub it sometimes never comes, and the image would freeze for good.
  _verversBeelden() {
    if (!this._laag) return;
    const nu = Date.now();
    this._laag.querySelectorAll('img[data-cam]').forEach(img => {
      const cam = this._cam(img.dataset.cam);
      if (!cam) return;
      const tempo = img.dataset.tempo ? +img.dataset.tempo : this._tempo(cam);
      const sleutel = img.dataset.cam + (img.dataset.rol || '');
      if (nu - (this._laatstBeeld[sleutel] || 0) < tempo - 40) return;
      const url = this._snap(cam, nu);
      if (!url) return;
      this._laatstBeeld[sleutel] = nu;

      let gewisseld = false;
      const wissel = () => {
        if (gewisseld) return;
        gewisseld = true;
        try { img.setAttribute('src', url); } catch (e) { /* laat maar */ }
      };
      const voor = new Image();
      voor.onload = wissel;
      voor.onerror = wissel;
      setTimeout(wissel, Math.min(tempo, 3 * SEC));
      voor.src = url;
    });
  }

  _verversStatus() {
    if (this._clip || !this._laag) return;
    this._cams().forEach(cam => {
      const el = this._laag.querySelector('.tegel[data-cam="' + cam.entity + '"]')
              || this._laag.querySelector('.mini[data-cam="' + cam.entity + '"]');
      if (!el) return;
      const n = this._niveau(cam);
      el.classList.toggle('beweging', n === 'beweging');
      el.classList.toggle('persoon', n === 'persoon');
      const stip = el.querySelector('.stip');
      if (stip) stip.style.display = n ? '' : 'none';
    });
    const t = this._laag.querySelector('.telling');
    if (t) t.textContent = this._telling();
  }

  _telling() {
    const cams = this._cams();
    const dood = cams.filter(c => !this._leeft(c)).length;
    const pers = cams.filter(c => this._niveau(c) === 'persoon').length;
    const bew = cams.filter(c => this._niveau(c) === 'beweging').length;
    const d = [];
    if (pers) d.push(pers + '× ' + this._t('person'));
    if (bew) d.push(bew + '× ' + this._t('motion'));
    if (dood) d.push(dood + ' ' + this._t('nosignal'));
    return d.join(' · ');
  }

  // ---------- tabs ----------

  _tabsHtml() {
    return '<div class="tabs">'
      + this._cfg.tabs.map((t, i) =>
          '<button data-t="' + i + '" class="' + (i === this._tab ? 'on' : '') + '">'
          + (t.icon ? '<ha-icon icon="' + t.icon + '"></ha-icon>' : '')
          + '<span>' + (t.naam || ('Tab ' + (i + 1))) + '</span></button>').join('')
      + '<span class="telling">' + this._telling() + '</span></div>';
  }

  _knoopTabs() {
    this._laag.querySelectorAll('.tabs button').forEach(b => {
      b.onclick = () => {
        const i = +b.dataset.t;
        if (i === this._tab) return;
        this._sluitAlles(true);
        this._tab = i;
        this._meldingen = [];
        this._mSleutel = '';
        this._teken();
        this._haalMeldingen();
      };
    });
  }

  // ---------- overview ----------

  _tegelHtml(cam, isHoofd) {
    // A weather image: a map underlay with a running precipitation layer on top.
    if (cam.weer && this._is24(cam)) {
      // The 24-hour forecast comes as one picture per hour on a fixed frame of
      // Nederland: a background, the rain, and borders with place names on top -
      // three images of the same size, stacked.
      const W = 'https://www.weerplaza.nl/Content/Images/Radar/';
      return '<div class="tegel weertegel w24 vrij' + (isHoofd ? ' hoofdtegel' : '')
        + '" data-cam="' + this._tsleutel(cam) + '"'
        + ' style="--vh:' + (cam.verhouding || '700/765') + '">'
        + '<div class="wkaart">'
        + '<img class="w24b" src="' + W + 'Radar-1050-v2.jpg" alt="">'
        + '<img class="wlaag" alt="">'
        + '<img class="w24b" src="' + W + 'Radar-1050-borders-v2.png" alt="">'
        + '</div>'
        + '<div class="wtijd"></div>'
        + (cam.naam ? '<div class="label">' + cam.naam + '</div>' : '') + '</div>';
    }
    if (cam.weer) {
      return '<div class="tegel weertegel vrij' + (isHoofd ? ' hoofdtegel' : '')
        + '" data-cam="' + this._tsleutel(cam) + '"'
        + ' style="--vh:' + (cam.verhouding || '1/1') + '">'
        + '<div class="wkaart"><div class="wveld">'
        + '<div class="wbasis"></div>'
        + '<img class="wlaag" alt="">'
        + '<div class="wnamen"></div>'
        + '</div></div>'
        + '<div class="wtijd"></div>'
        + (cam.naam ? '<div class="label">' + cam.naam + '</div>' : '') + '</div>';
    }
    // A tile may also be an ordinary Lovelace card: handy for a forecast or a
    // meter reading in between the camera images.
    if (cam.kaart) {
      return '<div class="tegel kaartje vrij' + (isHoofd ? ' hoofdtegel' : '')
        + '" data-cam="' + this._tsleutel(cam) + '"'
        + (cam.verhouding ? ' style="--vh:' + cam.verhouding + '"' : '') + '>'
        + '<div class="kaartvak"></div>'
        + (cam.naam ? '<div class="label">' + cam.naam + '</div>' : '') + '</div>';
    }
    const n = this._niveau(cam);
    const binnen = this._leeft(cam)
      ? '<img data-cam="' + cam.entity + '" src="' + this._snap(cam) + '" alt="">'
      : '<div class="leeg"><ha-icon icon="mdi:video-off-outline"></ha-icon><span>' + this._t('signal') + '</span></div>';
    return '<div class="tegel' + (n ? ' ' + n : '') + (cam.bijsnijden === false ? ' vrij' : '')
      + (isHoofd ? ' hoofdtegel' : '')
      + '" data-cam="' + cam.entity + '"'
      + (cam.verhouding ? ' style="--vh:' + cam.verhouding + '"' : '') + '>'
      + binnen
      + '<div class="stip" style="display:' + (n ? '' : 'none') + '"></div>'
      + (cam.naam ? '<div class="label">' + cam.naam + '</div>' : '') + '</div>';
  }

  _tekenOverzicht() {
    this._stopStroom();
    this._stopWeer();
    const cams = this._cams();
    const tabblad = this._cfg.tabs[this._tab] || {};

    // Swap tab: exactly one large tile, and you choose it by tapping a small tile on
    // the right. Everything else stays on this one screen.
    let groot, rest;
    if (tabblad.wisselen) {
      const keuze = (this._gekozen || {})[this._tab];
      const kop = (keuze ? this._cam(keuze) : null)
        || cams.filter(c => c.groot)[0] || cams[0];
      groot = kop ? [kop] : [];
      rest = cams.filter(c => c !== kop);
    } else {
      groot = cams.filter(c => c.groot);
      rest = cams.filter(c => !c.groot);
    }

    const hoofd = groot.length
      ? '<div class="kolom hoofd" style="--ng:' + groot.length + '">'
        + groot.map(c => this._tegelHtml(c, true)).join('') + '</div>' : '';
    // Small tiles sit in a single column next to the large image by default. With
    // grid: <number of columns> they are spread over the whole space beside it.
    const rst = tabblad.raster;
    const overig = !rest.length ? ''
      : rst
        ? '<div class="kolom overig raster" style="--kk:' + rst + '">'
          + rest.map(c => this._tegelHtml(c)).join('') + '</div>'
        : '<div class="kolom overig" style="--no:' + rest.length + '">'
          + rest.map(c => this._tegelHtml(c)).join('') + '</div>';

    const toonM = !this._cfg.kaal && tabblad.meldingen !== false
      && this._cfg.meldingen !== false;
    const kolom = !toonM ? ''
      : '<div class="mkol"><div class="mkop"><b>' + this._t('notifications') + '</b><span>' + this._t('today') + '</span></div>'
        + '<div class="scrollbox"><div class="mlijst">' + this._meldingenHtml() + '</div>'
        + '<div class="pijlen">'
        + '<button class="op"><ha-icon icon="mdi:chevron-up"></ha-icon></button>'
        + '<div class="rail"><div class="duim"></div></div>'
        + '<button class="neer"><ha-icon icon="mdi:chevron-down"></ha-icon></button>'
        + '</div></div></div>';

    this._laag.innerHTML = (this._cfg.kaal ? '' : this._tabsHtml())
      + '<div class="blad">' + hoofd + overig + kolom + '</div>';
    this._knoopTabs();
    this._knoopTegels();
    this._knoopMeldingen();
    this._knoopScroll();
    this._vulKaarten();
    this._vulWeer();
    requestAnimationFrame(() => { this._vulHoogte(); this._pasSchaal(); });
    // On the first draw the card may still be detached from the page and measure
    // zero wide; a moment later it is there.
    setTimeout(() => this._pasSchaal(), 200);
  }

  // ---------- weather image ----------

  // The Weerplaza radar images are separate pictures per moment in time; an index
  // says which ones exist. We run through them like a film. The precipitation layer
  // is transparent, so a map underlay goes beneath it and the place names go back
  // on top.
  _vulWeer() {
    if (!this._laag) return;
    const vakken = this._laag.querySelectorAll('.weertegel');
    if (!vakken.length) return;
    vakken.forEach(t => {
      const cam = this._cam(t.dataset.cam);
      if (cam && cam.weer && !t.dataset.klaar) {
        t.dataset.klaar = '1';
        this._startWeer(t, cam);
      }
    });
  }

  // The index wants a corner in degrees, the images come back in tile numbers. Hence
  // the usual conversion here from tile number to latitude and longitude.
  _weerBron(cam, plek) {
    const z = cam.zoom || 8;
    const n = cam.n || 4;
    const P = Math.pow(2, z);
    // Where to look, in this order: a latitude/longitude on the tile, tile numbers
    // on the tile, the home location set in Home Assistant, and only then the
    // Netherlands. So without any setting the radar is centred on your own home,
    // wherever in the world that is.
    let x = cam.x;
    let y = cam.y;
    const c = (this._hass && this._hass.config) || {};
    const heeftPlek = (cam.breedte != null && cam.lengte != null) || !!plek;
    if (heeftPlek || x == null || y == null) {
      const la = Number(cam.breedte != null ? cam.breedte : plek ? plek.la : c.latitude);
      const lo = Number(cam.lengte != null ? cam.lengte : plek ? plek.lo : c.longitude);
      if (isFinite(la) && isFinite(lo) && Math.abs(la) < 85 && !(la === 0 && lo === 0)) {
        const r = la * Math.PI / 180;
        const fx = (lo + 180) / 360 * P;
        const fy = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * P;
        x = Math.round(fx - n / 2);
        y = Math.round(fy - n / 2);
      } else {
        x = 129;
        y = 82;
      }
    }
    const lon = (xx) => xx / P * 360 - 180;
    const lat = (yy) => 180 / Math.PI * Math.atan(Math.sinh(Math.PI * (1 - 2 * yy / P)));
    const vak = z + '/' + lat(y).toFixed(4) + '/' + lon(x).toFixed(4)
      + '/' + lat(y + n).toFixed(4) + '/' + lon(x + n).toFixed(4);
    const B = 'https://imn-rust-lb.infoplaza.io/v4/nowcast/tiles';
    // 'weather' carries a value, not a key, so both spellings are accepted here.
    const wolken = cam.weer === 'rain-and-clouds' || cam.weer === 'regenwolken';
    return {
      B: B, z: z, x: x, y: y, n: n,
      ondergrond: true,
      mengen: wolken,
      index: B + (wolken ? '/radarsatellite/observations/' : '/radar/forecast/')
        + vak + '?outputtype=' + (wolken ? 'jpeg' : 'image'),
    };
  }

  // The server rounds the requested area outward to whole tiles and says in the
  // image URL which ones those became. We aim the underlay at that, otherwise the
  // precipitation slides across the map.
  _weerVak(src) {
    const d = src.split('?')[0].split('/');
    const g = d.slice(-5).map(Number);
    if (g.some(isNaN)) return null;
    return { z: g[0], y0: g[1], x0: g[2], ny: g[3] - g[1], nx: g[4] - g[2] };
  }

  // Grow the map area until it fills the tile without stretching.
  _weerPassend(t) {
    if (t.classList.contains('w24')) {
      // Three stacked pictures of one frame: same size, same crop, so they line up.
      const w = t.clientWidth + 'px';
      const h = t.clientHeight + 'px';
      t.querySelectorAll('.wkaart img').forEach((im) => { im.style.width = w; im.style.height = h; });
      return;
    }
    const veld = t.querySelector('.wveld');
    if (!veld) return;
    const nx = Number(t.dataset.wx) || 0;
    const ny = Number(t.dataset.wy) || 0;
    // clientWidth and not getBoundingClientRect: the latter counts in a zoom on a
    // parent box, and the sizes we write below do not.
    const bw = t.clientWidth;
    const bh = t.clientHeight;
    if (!nx || !ny || !bw || !bh) return;
    const s = Math.max(bw / nx, bh / ny);
    const vw = s * nx;
    const vh = s * ny;
    // Everything in pixels and positioned by hand, centred in the tile. Safari 15
    // misplaced the percentage-centred field and sized '1fr' grid rows from the
    // images inside them: the map slid down and left a dark band at the top.
    veld.style.width = vw + 'px';
    veld.style.height = vh + 'px';
    veld.style.left = Math.round((bw - vw) / 2) + 'px';
    veld.style.top = Math.round((bh - vh) / 2) + 'px';
    veld.style.transform = 'none';
    const cel = s + 'px';
    t.querySelectorAll('.wbasis, .wnamen').forEach((g) => {
      g.style.gridTemplateColumns = 'repeat(' + nx + ',' + cel + ')';
      g.style.gridTemplateRows = 'repeat(' + ny + ',' + cel + ')';
      g.querySelectorAll('img').forEach((im) => { im.style.width = cel; im.style.height = cel; });
    });
    const laag = t.querySelector('.wlaag');
    if (laag) { laag.style.width = vw + 'px'; laag.style.height = vh + 'px'; }
  }

  _alleWeerPassend() {
    if (!this._laag) return;
    this._laag.querySelectorAll('.weertegel').forEach(t => this._weerPassend(t));
  }

  _weerOndergrond(t, v, metBasis) {
    const basis = t.querySelector('.wbasis');
    const namen = t.querySelector('.wnamen');
    if (!basis) return;
    const M = 'https://maps.meteoplaza.com/styles/';
    let a = '', c = '';
    for (let yy = v.y0; yy < v.y0 + v.ny; yy++) {
      for (let xx = v.x0; xx < v.x0 + v.nx; xx++) {
        a += '<img src="' + M + 'base-layer/' + v.z + '/' + xx + '/' + yy + '.png" alt="">';
        c += '<img src="' + M + 'b2c-overlay/' + v.z + '/' + xx + '/' + yy + '.png" alt="">';
      }
    }
    basis.innerHTML = metBasis ? a : '';
    if (namen) namen.innerHTML = c;
  }

  async _startWeer(t, cam) {
    let plek = null;
    if (cam.plaats && !this._is24(cam)) {
      plek = await this._plek(cam.plaats);
      if (!plek) {
        const k = t.querySelector('.wtijd');
        if (k) k.textContent = this._t('noplace');
        return;
      }
    }
    const b = this._weerBron(cam, plek);
    const laag = t.querySelector('.wlaag');
    // The cloud image is a jpeg: bright where there are clouds, black where there are
    // none. With 'screen' that black drops out and only the cloud stays on the map.
    if (laag) laag.style.mixBlendMode = b.mengen ? 'screen' : '';
    const klok = t.querySelector('.wtijd');
    if (klok) klok.textContent = this._t('loading');
    let beelden = [];
    if (this._is24(cam)) {
      beelden = await this._beelden24(cam);
      if (!beelden) { if (klok) klok.textContent = this._t('offline'); return; }
      this._weerPassend(t);
    } else {
      try {
        const j = await (await fetch(b.index)).json();
        beelden = (j.layers || []).map(l => ({ src: b.B + l.url, tijd: l.time }));
      } catch (e) {
        if (klok) klok.textContent = this._t('offline');
        return;
      }
    }
    if (!beelden.length) { if (klok) klok.textContent = this._t('noimage'); return; }
    const vak = this._is24(cam) ? null : this._weerVak(beelden[0].src);
    if (vak) {
      t.style.setProperty('--wx', String(vak.nx));
      t.style.setProperty('--wy', String(vak.ny));
      t.dataset.wx = vak.nx;
      t.dataset.wy = vak.ny;
      this._weerOndergrond(t, vak, b.ondergrond);
      this._weerPassend(t);
    }
    // Preload, otherwise the first round stutters.
    beelden.forEach(x => { const i = new Image(); i.src = x.src; });
    let k = 0;
    const toon = () => {
      const x = beelden[k];
      if (laag) laag.src = x.src;
      if (klok) klok.textContent = this._weerLabel(x.tijd);
      k = (k + 1) % beelden.length;
    };
    toon();
    if (!this._weerLopers) this._weerLopers = [];
    this._weerLopers.push(setInterval(toon, Math.max(80, (cam.tempo || 0.35) * SEC)));
    // The series goes stale; fetch the index again every so often.
    const ver = Math.max(60, cam.ververs || 300) * SEC;
    this._weerLopers.push(setTimeout(() => {
      this._stopWeer();
      if (this._laag) this._laag.querySelectorAll('.weertegel').forEach(e => { e.dataset.klaar = ''; });
      this._vulWeer();
    }, ver));
  }

  // A place by name - 'Texel', 'Chamonix', 'Paris, US' - or an entity that has a
  // position: a zone, a person, a phone. A name is looked up once with the free
  // Open-Meteo geocoder and then remembered in this browser; an entity needs no
  // lookup at all.
  async _plek(naam) {
    const p = String(naam).trim();
    if (!p) return null;
    const st = this._hass && this._hass.states[p];
    if (st) {
      const a = st.attributes || {};
      return (a.latitude != null && a.longitude != null) ? { la: +a.latitude, lo: +a.longitude } : null;
    }
    const sleutel = 'touch-camera-card:plaats:' + p.toLowerCase();
    try {
      const b = JSON.parse(localStorage.getItem(sleutel) || 'null');
      if (b) return b;
    } catch (e) { /* no storage: just look it up */ }
    const m = p.match(/^(.*?),\s*([A-Za-z]{2})$/);
    const u = 'https://geocoding-api.open-meteo.com/v1/search?count=1&language=' + ctcTaal(this._hass)
      + '&name=' + encodeURIComponent(m ? m[1] : p) + (m ? '&countryCode=' + m[2].toUpperCase() : '');
    try {
      const j = await (await fetch(u)).json();
      const r = j.results && j.results[0];
      if (!r) return null;
      const uit = { la: r.latitude, lo: r.longitude };
      try { localStorage.setItem(sleutel, JSON.stringify(uit)); } catch (e) { /* fine */ }
      return uit;
    } catch (e) {
      return null;
    }
  }

  _is24(cam) {
    return cam.weer === 'rain-24h' || cam.weer === 'regen24';
  }

  // Weerplaza's 24-hour forecast: one picture per hour, named after the model run it
  // came from. The newest run is a few hours old; we find it by trying the most
  // recent hours until one answers, then take the hours from now onward.
  async _beelden24(cam) {
    const B = 'https://lb01.meteoplaza.com/gdata/radar/24h/precipitation_NL_';
    const p = (n, l) => String(n).padStart(l || 2, '0');
    const code = (d) => d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + p(d.getUTCHours());
    const probeer = (u) => new Promise((ok) => {
      const i = new Image();
      const tm = setTimeout(() => ok(false), 8 * SEC);
      i.onload = () => { clearTimeout(tm); ok(true); };
      i.onerror = () => { clearTimeout(tm); ok(false); };
      i.src = u;
    });
    const uur = 3600 * SEC;
    const nu = Date.now();
    let run = null;
    for (let h = 0; h < 12 && !run; h++) {
      const d = new Date(Math.floor(nu / uur) * uur - h * uur);
      if (await probeer(B + code(d) + '+001.png')) run = d;
    }
    if (!run) return null;
    const uren = Math.min(48, Math.max(3, Number(cam.uren) || 24));
    const eerste = Math.max(1, Math.ceil((nu - run.getTime()) / uur));
    const laatste = Math.min(48, eerste + uren - 1);
    const uit = [];
    for (let o = eerste; o <= laatste; o++) {
      uit.push({ src: B + code(run) + '+' + p(o, 3) + '.png', tijd: new Date(run.getTime() + o * uur).toISOString() });
    }
    return uit;
  }

  // The clock on a weather tile says not only what time a picture is for, but how
  // far from now that is - otherwise you cannot tell a forecast from a look back.
  _weerLabel(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const min = Math.round((d.getTime() - Date.now()) / 60000);
    let rel;
    if (Math.abs(min) < 5) rel = this._t('now');
    else if (Math.abs(min) < 120) rel = (min > 0 ? '+' : '\u2212') + Math.abs(min) + ' min';
    else rel = (min > 0 ? '+' : '\u2212') + Math.round(Math.abs(min) / 60) + ' ' + this._t('hourshort');
    const vandaag = new Date().toDateString() === d.toDateString();
    const dag = vandaag ? '' : d.toLocaleDateString(ctcTaal(this._hass), { weekday: 'short' }).replace('.', '') + ' ';
    return dag + this._weerTijd(iso) + ' \u00b7 ' + rel;
  }

  _weerTijd(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const p = (n) => (n < 10 ? '0' : '') + n;
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // Lovelace cards inside a tile. The card helpers come from the frontend and have
  // to be fetched once; hence async, and hence only afterwards.
  async _vulKaarten() {
    this._kaartEls = [];
    if (!this._laag) return;
    const vakken = this._laag.querySelectorAll('.kaartje');
    if (!vakken.length) return;
    if (!this._helpers && window.loadCardHelpers) {
      this._helpers = await window.loadCardHelpers();
    }
    if (!this._helpers || !this._laag) return;
    this._laag.querySelectorAll('.kaartje').forEach(t => {
      const cam = this._cam(t.dataset.cam);
      const vak = t.querySelector('.kaartvak');
      if (!cam || !cam.kaart || !vak || vak.firstChild) return;
      const el = this._helpers.createCardElement(JSON.parse(JSON.stringify(cam.kaart)));
      el.hass = this._hass;
      vak.appendChild(el);
      this._kaartEls.push(el);
    });
  }

  _knoopTegels() {
    const wissel = (this._cfg.tabs[this._tab] || {}).wisselen;
    this._laag.querySelectorAll('.tegel[data-cam], .mini[data-cam]').forEach(el => {
      el.onclick = () => {
        const cam = this._cam(el.dataset.cam);
        if (!cam) return;
        // As a single tile the card is usually a doorway to somewhere else, so a
        // tap can be sent to another page instead of opening the image large.
        if (this._cfg.navigeren) {
          history.pushState(null, '', this._cfg.navigeren);
          this.dispatchEvent(new CustomEvent('location-changed', { bubbles: true, composed: true }));
          return;
        }
        // A single tile with nowhere to go opens the camera's own dialog, which is
        // what a tap on anything else in Home Assistant does too.
        if (this._cfg.kaal) {
          this.dispatchEvent(new CustomEvent('hass-more-info', {
            detail: { entityId: cam.entity }, bubbles: true, composed: true,
          }));
          return;
        }
        if (wissel) {
          // The large tile does nothing; a small tile takes its place.
          if (el.className.indexOf('hoofdtegel') >= 0) return;
          if (!this._gekozen) this._gekozen = {};
          this._gekozen[this._tab] = el.dataset.cam;
          this._tekenOverzicht();
          return;
        }
        if (!this._leeft(cam)) return;
        this._open = cam.entity;
        this._teken();
      };
    });
  }

  // ---------- notifications ----------

  _dagStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  }

  // Ask per camera separately, so we know which camera it was.
  async _haalMeldingen() {
    if (this._cfg.meldingen === false || !this._hass) return;
    const tabblad = this._cfg.tabs[this._tab] || {};
    if (tabblad.meldingen === false) { this._meldingen = []; this._mSleutel = ''; return; }
    const max = this._cfg.meldingen_aantal;
    const perCam = this._cfg.meldingen_per_camera;
    const dag = this._dagStart();
    const tab = this._tab;

    const taken = this._cams().map(async cam => {
      const kort = cam.entity.split('.')[1];
      const id = 'media-source://frigate/frigate/event-search/clips/.kaart/' + dag + '//' + kort + '//';
      try {
        const d = await this._hass.callWS({ type: 'media_source/browse_media', media_content_id: id });
        return (d.children || []).slice(0, perCam).map(k => {
          const t = k.title || '';
          return {
            naam: cam.naam,
            tijd: (t.match(/\d{2}:\d{2}:\d{2}/) || [''])[0].slice(0, 5),
            sort: t.slice(0, 19),
            wat: (t.match(/\[([^\]]*)\]/) || ['', ''])[1],
            thumb: k.thumbnail || '',
            id: k.media_content_id,
          };
        });
      } catch (e) { return []; }
    });

    let alles;
    try { alles = (await Promise.all(taken)).flat(); } catch (e) { alles = []; }
    if (tab !== this._tab) return;

    alles.sort((a, b) => b.sort.localeCompare(a.sort));
    alles = alles.slice(0, max);

    const sleutel = tab + '|' + alles.map(k => k.id).join(',');
    if (sleutel === this._mSleutel) return;
    this._mSleutel = sleutel;

    // Thumbnails that were signed already we keep: a new signature gives a new URL
    // and so a loading moment for nothing.
    const bekend = {};
    (this._meldingen || []).forEach(k => { if (k.id && k.thumb) bekend[k.id] = k.thumb; });
    await Promise.all(alles.map(async k => {
      if (!k.thumb) return;
      if (bekend[k.id]) { k.thumb = bekend[k.id]; return; }
      try { k.thumb = await this._onderteken(k.thumb.split('?')[0]); } catch (e) { /* dan blijft het leeg */ }
    }));

    if (tab !== this._tab) return;
    this._meldingen = alles;
    if (this._laag && !this._open && !this._clip) {
      const lijst = this._laag.querySelector('.mlijst');
      if (lijst) {
        lijst.innerHTML = this._meldingenHtml();
        this._knoopMeldingen();
        if (this._tekenRail) this._tekenRail();
      }
    }
  }

  _meldingenHtml() {
    if (!this._meldingen.length) return '<div class="mleeg">' + this._t('nothing') + '</div>';
    return this._meldingen.map((m, i) =>
      '<button class="melding" data-i="' + i + '">'
      + '<img src="' + m.thumb + '" alt="" loading="lazy">'
      + '<div class="mtxt"><div class="b1">' + m.naam + '</div>'
      + '<div class="b2">' + m.tijd + ' · ' + (m.wat || this._t('event')) + '</div></div></button>').join('');
  }

  _knoopMeldingen() {
    this._laag.querySelectorAll('.melding').forEach(b => {
      b.onclick = () => this._toonClip(this._meldingen[+b.dataset.i]);
    });
  }

  // Arrows above and below, with a bar between them showing where you are.
  // Deliberately not draggable: in v1 that was the bulk of the code for something
  // you do with your finger on a touchscreen anyway.
  _knoopScroll() {
    const lijst = this._laag.querySelector('.mlijst');
    const rail = this._laag.querySelector('.rail');
    if (!lijst || !rail) { this._tekenRail = null; return; }
    const duim = rail.querySelector('.duim');
    const op = this._laag.querySelector('.pijlen .op');
    const neer = this._laag.querySelector('.pijlen .neer');

    const teken = () => {
      const meer = lijst.scrollHeight > lijst.clientHeight + 4;
      rail.classList.toggle('aan', meer);
      if (op) op.disabled = !meer || lijst.scrollTop <= 0;
      if (neer) neer.disabled = !meer || lijst.scrollTop + lijst.clientHeight >= lijst.scrollHeight - 1;
      if (!meer) return;
      const deel = lijst.clientHeight / lijst.scrollHeight;
      const pos = lijst.scrollTop / (lijst.scrollHeight - lijst.clientHeight);
      duim.style.height = Math.max(12, deel * 100) + '%';
      duim.style.top = (pos * (100 - Math.max(12, deel * 100))) + '%';
    };
    this._tekenRail = teken;

    lijst.onscroll = teken;
    const stap = () => Math.max(80, lijst.clientHeight * 0.8);
    if (op) op.onclick = () => lijst.scrollBy({ top: -stap(), behavior: 'smooth' });
    if (neer) neer.onclick = () => lijst.scrollBy({ top: stap(), behavior: 'smooth' });
    teken();
    setTimeout(teken, 400);
    setTimeout(teken, 1500);
  }

  // ---------- detail: large view ----------

  _tekenDetail() {
    this._stopClip();
    const cam = this._cam(this._open);
    if (!cam) { this._open = null; this._tekenOverzicht(); return; }
    const rest = this._cams().filter(c => c.entity !== cam.entity);

    const mini = rest.map(c => {
      const n = this._niveau(c);
      const binnen = this._leeft(c)
        ? '<img data-cam="' + c.entity + '" data-rol="mini" src="' + this._snap(c) + '" alt="">'
        : '<div class="leeg"><ha-icon icon="mdi:video-off-outline"></ha-icon></div>';
      return '<div class="mini' + (n ? ' ' + n : '') + '" data-cam="' + c.entity + '">'
        + binnen + '<div class="stip" style="display:' + (n ? '' : 'none') + '"></div>'
        + '<div class="dlabel">' + c.naam + '</div></div>';
    }).join('');

    this._laag.innerHTML = this._tabsHtml()
      + '<div class="detail"><div class="dkop">'
      + '<button class="terug"><ha-icon icon="mdi:chevron-left"></ha-icon><span>' + this._t('back') + '</span></button>'
      + '<div class="dnaam">' + cam.naam + '</div>'
      + '<div class="dnoot"><i></i><span class="noottekst">' + this._t('connecting') + '</span></div>'
      + '</div>'
      + '<div class="dlijf"><div class="speler"></div>'
      + '<div class="zijkolom" style="--nd:' + Math.max(rest.length, 1) + '">' + mini + '</div>'
      + '</div></div>';

    this._knoopTabs();
    this._knoopTegels();
    this._laag.querySelector('.terug').onclick = () => this._sluitAlles();
    this._startGroot(cam);
    requestAnimationFrame(() => { this._vulHoogte(); this._pasSchaal(); });
  }

  // One word of the interface, in the language Home Assistant is set to.
  _t(sleutel, arg) {
    return ctcT(this._taalKnop || ctcTaal(this._hass), sleutel, arg);
  }

  _noot(tekst, terugval) {
    const n = this._laag && this._laag.querySelector('.dnoot');
    if (!n) return;
    n.classList.toggle('terugval', !!terugval);
    const s = n.querySelector('.noottekst');
    if (s) s.textContent = tekst;
  }

  _startGroot(cam) {
    const doel = this._laag.querySelector('.speler');
    if (!doel) return;
    this._stopStroom();

    // The last snapshot as the background: there is an image straight away instead
    // of a black rectangle, even if the stream takes a moment.
    const snap = this._snap(cam);
    if (snap) doel.style.backgroundImage = 'url("' + snap.replace(/"/g, '%22') + '")';

    if (this._cfg.stroom === false) { this._grootAlsSnapshots(cam, doel, null); return; }

    const url = this._stroomUrl(cam);
    if (!url) { this._grootAlsSnapshots(cam, doel, this._t('nosource')); return; }

    const img = document.createElement('img');
    img.className = 'stroom';
    this._stroom = img;
    img.addEventListener('load', () => {
      if (this._stroom !== img) return;
      this._noot(this._t('live'));
    }, { once: true });
    img.addEventListener('error', () => {
      if (this._stroom !== img) return;
      this._grootAlsSnapshots(cam, doel, this._t('nostart'));
    });
    img.src = url + '&_t=' + Date.now();
    doel.appendChild(img);
    this._startWachthond(cam, doel, img);
  }

  // An MJPEG stream that stalls looks exactly like a scene that is not moving: the
  // last frame simply stays there. On a camera that is the most dangerous failure
  // there is. So every two seconds take a tiny sample of the image and compare it.
  // Sensor noise makes sure two real frames are never identical; if the sample does
  // stay the same, nothing is coming in any more.
  _startWachthond(cam, doel, img) {
    const doek = document.createElement('canvas');
    doek.width = 32; doek.height = 18;
    let ctx;
    try { ctx = doek.getContext('2d', { willReadFrequently: true }); } catch (e) { ctx = null; }
    if (!ctx) return;

    const nodig = Math.max(2, Math.round(this._cfg.stil_na / 2));
    let vorige = null, gelijk = 0;

    this._hond = setInterval(() => {
      if (this._stroom !== img || !img.isConnected) return;
      if (!img.naturalWidth) return;
      let som = 0;
      try {
        ctx.drawImage(img, 0, 0, 32, 18);
        const d = ctx.getImageData(0, 0, 32, 18).data;
        for (let i = 0; i < d.length; i += 4) som = ((som * 31) + d[i]) % 2147483647;
      } catch (e) {
        clearInterval(this._hond); this._hond = null;   // must not: that would leave no watchdog
        return;
      }
      if (som === vorige) {
        gelijk++;
        if (gelijk >= nodig) this._grootAlsSnapshots(cam, doel, this._t('stalled'));
      } else { vorige = som; gelijk = 0; }
    }, 2 * SEC);
  }

  // The fallback. Once, hard limited, and reported visibly - because a fallback you
  // cannot see is exactly how you later think nothing was wrong.
  _grootAlsSnapshots(cam, doel, reden) {
    this._stopStroom();
    if (!doel || !doel.isConnected) return;
    const img = document.createElement('img');
    img.dataset.cam = cam.entity;
    img.dataset.rol = 'groot';
    img.dataset.tempo = String(Math.max(this._cfg.groot_ververs, 0.2) * SEC);
    img.src = this._snap(cam);
    doel.appendChild(img);
    this._noot(reden ? reden + ' · ' + this._t('snapshots') : this._t('snapshots'), !!reden);
  }

  _stopStroom() {
    if (this._hond) { clearInterval(this._hond); this._hond = null; }
    if (this._stroom) {
      // Not just removing it: the connection stays open otherwise. In v1 that was
      // precisely the mistake that eventually locked up the Nest Hub.
      try { this._stroom.src = ''; this._stroom.remove(); } catch (e) { /* laat maar */ }
      this._stroom = null;
    }
    const doel = this._laag && this._laag.querySelector('.speler');
    if (doel) doel.querySelectorAll('img[data-rol="groot"]').forEach(i => {
      try { i.src = ''; i.remove(); } catch (e) { /* laat maar */ }
    });
  }

  // ---------- clip ----------

  // Frigate paths need authentication; Home Assistant signs them.
  async _onderteken(pad) {
    const s = await this._hass.callWS({ type: 'auth/sign_path', path: pad, expires: 3600 });
    return s.path;
  }

  _klantEnId(m) {
    const delen = (m.id || '').split('/');
    return { klant: delen[3] || 'frigate', eid: delen[delen.length - 1] || '' };
  }

  async _toonClip(m) {
    if (!m) return;
    this._stopStroom();
    this._open = null;
    this._clip = {
      titel: m.naam + ' · ' + m.tijd + (m.wat ? ' · ' + m.wat : ''),
      thumb: m.thumb || '', url: null, klaar: false, mis: '',
    };
    this._teken();

    const k = this._klantEnId(m);
    if (!k.eid) { this._clip.mis = this._t('norecording'); this._tekenClip(); return; }

    // No sped-up preview gif any more. It was meant as a stopgap but stayed put as
    // soon as the recording failed to arrive, and a grainy sped-up clip cannot be told
    // apart from a malfunction. The still thumbnail does the same work through the
    // video's poster attribute: an image straight away, and it gives way by itself to
    // the first real frame. A still image is never mistaken for a clip.

    try {
      const u = await this._onderteken('/api/frigate/' + k.klant + '/notifications/' + k.eid + '/clip.mp4');
      if (!this._clip) return;
      this._clip.url = u;
      this._tekenClip();
    } catch (e) {
      if (this._clip) { this._clip.mis = this._t('nofetch'); this._tekenClip(); }
    }
  }

  // The clip gets a screen of its own on top of the card, outside the flex chain of
  // the main view. That was the one real difference left with the test card where
  // the same recordings do play: there the video sits in a bare box measured out in
  // pixels - no aspect-ratio, no flexbox, no rounded clipping around it. In the card
  // it sat at the bottom of three nested flex layers with two rounded clips over it,
  // and then it does decode but no image reaches the screen.
  _tekenClip() {
    const c = this._clip;
    if (!c) return;
    this._stopStroom();
    this._stopClip();

    let onder = '';
    if (c.mis) onder = '<div class="mis">' + c.mis + '</div>';
    else if (!c.url) onder = '<div class="bezig">' + this._t('fetching') + '</div>';

    this._laag.innerHTML = this._tabsHtml()
      + '<div class="clipscherm">'
      + '<div class="ckop">'
      + '<button class="terug"><ha-icon icon="mdi:chevron-left"></ha-icon><span>' + this._t('back') + '</span></button>'
      + '<div class="dnaam">' + c.titel + '</div></div>'
      + '<div class="cvak">' + onder + '</div></div>';

    this._knoopTabs();
    this._laag.querySelector('.terug').onclick = () => this._sluitAlles();

    // Measure the box in pixels instead of leaving it to the layout.
    const vak = this._laag.querySelector('.cvak');
    const hoog = Math.max(160, this._laag.clientHeight - 34 - 34 - 24);
    const breed = Math.min(this._laag.clientWidth - 36, Math.round(hoog * 16 / 9));
    vak.style.width = breed + 'px';
    vak.style.height = Math.round(breed * 9 / 16) + 'px';

    if (!c.url) {
      if (c.thumb) {
        const stil = document.createElement('img');
        stil.className = 'stil';
        stil.src = c.thumb;
        vak.insertBefore(stil, vak.firstChild);
      }
      return;
    }

    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.autoplay = true; v.controls = true;
    v.preload = 'none';
    if (this._cfg.clip_herhalen !== false) v.loop = true;
    if (c.thumb) v.poster = c.thumb;
    vak.insertBefore(v, vak.firstChild);
    v.src = c.url;
    v.play().catch(() => { /* bediening staat aan */ });
    this._clipSpeler = v;

    const kijk = () => {
      if (v.currentTime < 0.3) return;
      v.removeEventListener('timeupdate', kijk);
      if (!this._clip) return;
      this._clip.klaar = true;
      const b = vak.querySelector('.bezig');
      if (b) b.remove();
    };
    v.addEventListener('timeupdate', kijk);

    if (this._clipTimer) clearTimeout(this._clipTimer);
    this._clipTimer = setTimeout(() => {
      if (!this._clip || this._clip.klaar) return;
      this._clip.mis = this._t('late', this._cfg.clip_wacht);
      this._toonMis();
    }, this._cfg.clip_wacht * SEC);
  }

  // Only add the notification. Rebuilding would throw away the player that might be
  // loading at that very moment.
  _toonMis() {
    const doel = this._laag && this._laag.querySelector('.cvak');
    if (!doel || !this._clip) return;
    const b = doel.querySelector('.bezig');
    if (b) b.remove();
    if (doel.querySelector('.mis')) return;
    const d = document.createElement('div');
    d.className = 'mis';
    d.textContent = this._clip.mis;
    doel.appendChild(d);
  }

  _stopClip() {
    if (this._meetTik) { clearInterval(this._meetTik); this._meetTik = null; }
    if (this._clipTimer) { clearTimeout(this._clipTimer); this._clipTimer = null; }
    if (this._beeldTimer) { clearTimeout(this._beeldTimer); this._beeldTimer = null; }
    if (this._clipSpeler) {
      try {
        this._clipSpeler.pause();
        this._clipSpeler.removeAttribute('src');
        this._clipSpeler.load();
        this._clipSpeler.remove();
      } catch (e) { /* laat maar */ }
      this._clipSpeler = null;
    }
  }

  _sluitAlles(stil) {
    this._stopStroom();
    this._stopClip();
    this._open = null;
    this._clip = null;
    if (!stil) this._teken();
  }
}

customElements.define('touch-camera-card', TouchCameraCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'touch-camera-card',
  name: 'Touch camera card',
  description: 'Cameras with their own tabs, built for touch panels and Nest Hub cast dashboards: snapshots on the tiles, MJPEG in the large view, mp4 for notifications',
});

console.info('%c touch-camera-card %c 1.0.0 ', 'background:#4aa3ff;color:#fff', '');


// ---------------------------------------------------------------------------
// Form for the dashboard editor.
//
// Everything can be set here: the tabs, the cameras per tab and the general
// settings. The code editor keeps working and stays authoritative for keys this
// form does not know about - those are passed through untouched.
// ---------------------------------------------------------------------------

// What the card already does when a key is missing. Values equal to these are left
// out when saving, so the YAML stays short.
const STANDAARD = {
  ververs: 1,
  groot_ververs: 0.5,
  stroom: true,
  stil_na: 6,
  clip_wacht: 20,
  clip_herhalen: true,
  meldingen: true,
  meldingen_aantal: 20,
  meldingen_per_camera: 8,
  vullen: false,
};

const SCHEMA = [
  {
    name: '', type: 'expandable', title: 'Formaat', icon: 'mdi:resize',
    schema: [
      { name: 'hoogte', selector: { number: { min: 260, max: 1200, step: 10, mode: 'box', unit_of_measurement: 'px' } } },
      { name: 'vullen', selector: { boolean: {} } },
      { name: 'vul_marge', selector: { number: { min: 0, max: 120, step: 2, mode: 'box', unit_of_measurement: 'px' } } },
    ],
  },
  {
    name: '', type: 'expandable', title: 'Beeld', icon: 'mdi:camera',
    schema: [
      { name: 'ververs', selector: { number: { min: 0.5, max: 60, step: 0.5, mode: 'box', unit_of_measurement: 's' } } },
      { name: 'stroom', selector: { boolean: {} } },
      { name: 'groot_ververs', selector: { number: { min: 0.2, max: 10, step: 0.1, mode: 'box', unit_of_measurement: 's' } } },
      { name: 'stil_na', selector: { number: { min: 2, max: 60, step: 1, mode: 'box', unit_of_measurement: 's' } } },
    ],
  },
  {
    name: '', type: 'expandable', title: 'Meldingen', icon: 'mdi:bell',
    schema: [
      { name: 'meldingen', selector: { boolean: {} } },
      { name: 'meldingen_aantal', selector: { number: { min: 1, max: 60, step: 1, mode: 'box' } } },
      { name: 'meldingen_per_camera', selector: { number: { min: 1, max: 30, step: 1, mode: 'box' } } },
      { name: 'melding_breedte', selector: { number: { min: 80, max: 400, step: 10, mode: 'box', unit_of_measurement: 'px' } } },
      { name: 'clip_wacht', selector: { number: { min: 3, max: 90, step: 1, mode: 'box', unit_of_measurement: 's' } } },
      { name: 'clip_herhalen', selector: { boolean: {} } },
    ],
  },
];

const TAB_SCHEMA = [
  {
    name: '', type: 'grid', schema: [
      { name: 'naam', selector: { text: {} } },
      { name: 'icon', selector: { icon: {} } },
    ],
  },
  { name: 'meldingen', selector: { boolean: {} } },
  { name: 'wisselen', selector: { boolean: {} } },
  { name: 'raster', selector: { number: { min: 0, max: 4, step: 1, mode: 'box' } } },
];

const CAM_SCHEMA = [
  { name: 'entity', selector: { entity: { filter: [{ domain: 'camera' }] } } },
  {
    name: '', type: 'grid', schema: [
      { name: 'naam', selector: { text: {} } },
      { name: 'groot', selector: { boolean: {} } },
    ],
  },
  {
    name: '', type: 'expandable', title: 'Meer instellingen', icon: 'mdi:tune',
    schema: [
      { name: 'beweging', selector: { entity: { filter: [{ domain: 'binary_sensor' }] } } },
      { name: 'persoon', selector: { entity: { filter: [{ domain: 'binary_sensor' }] } } },
      { name: 'ververs', selector: { number: { min: 0.5, max: 600, step: 0.5, mode: 'box', unit_of_measurement: 's' } } },
      { name: 'bijsnijden', selector: { boolean: {} } },
      { name: 'verhouding', selector: { text: {} } },
    ],
  },
];

// The editor labels in two languages. Which one is shown follows the language the
// user has set in Home Assistant, so a Dutch household keeps its Dutch form and
// everyone else gets English. An unknown language falls back to English.
const LABELS_EN = {
  // general
  vullen: 'Decide the height itself (fills the screen)',
  hoogte: 'Fixed height',
  vul_marge: 'Bottom margin when deciding itself',
  ververs: 'Refresh every',
  stroom: 'Large view as a continuous stream',
  groot_ververs: 'Refresh large view every (after a fallback)',
  stil_na: 'Treat stream as stalled after',
  meldingen: 'Show notifications',
  meldingen_aantal: 'Notifications in the list',
  meldingen_per_camera: 'Notifications per camera',
  melding_breedte: 'Width of a notification image',
  clip_wacht: 'Give up on the recording after',
  clip_herhalen: 'Loop the recording',
  // tab and camera
  naam: 'Name',
  icon: 'Icon',
  entity: 'Camera',
  wisselen: 'Swap instead of opening large',
  raster: 'Small tiles in a grid (number of columns)',
  groot: 'Show large',
  beweging: 'Motion sensor',
  persoon: 'Person sensor',
  bijsnijden: 'Crop image to 16:9',
  verhouding: 'Custom aspect ratio (e.g. 550/512)',
  // tile
  grijs: 'Grey until a person is seen',
  rondte: 'Corner rounding',
  rand: 'Thickness of the alert ring',
  navigeren: 'A tap goes to (dashboard path)',
};

const KOPPEN_EN = {
  Formaat: 'Size',
  Beeld: 'Image',
  Meldingen: 'Notifications',
  'Meer instellingen': 'More settings',
};

const LABELS_NL = {
  // general
  vullen: 'Hoogte zelf bepalen (vult het scherm)',
  hoogte: 'Vaste hoogte',
  vul_marge: 'Marge onderaan bij zelf bepalen',
  ververs: 'Verversen om de',
  stroom: 'Groot beeld als doorlopende stroom',
  groot_ververs: 'Groot beeld verversen om de (bij terugval)',
  stil_na: 'Stroom als vastgelopen beschouwen na',
  meldingen: 'Meldingen tonen',
  meldingen_aantal: 'Meldingen in de lijst',
  meldingen_per_camera: 'Meldingen per camera',
  melding_breedte: 'Breedte van een meldingsplaatje',
  clip_wacht: 'Opname opgeven na',
  clip_herhalen: 'Opname herhalen',
  // tab and camera
  naam: 'Naam',
  icon: 'Pictogram',
  entity: 'Camera',
  wisselen: 'Wisselen in plaats van groot openen',
  raster: 'Kleine tegels in een raster (aantal kolommen)',
  groot: 'Groot tonen',
  beweging: 'Sensor beweging',
  persoon: 'Sensor persoon',
  bijsnijden: 'Beeld bijsnijden tot 16:9',
  verhouding: 'Eigen beeldverhouding (bv. 550/512)',
  // tegel
  grijs: 'Grijs tot er iemand staat',
  rondte: 'Ronding van de hoeken',
  rand: 'Dikte van de meldingsrand',
  navigeren: 'Aantikken gaat naar (pad)',
};

const STIJL = `
.ctc-ed { --ctc-rand: var(--divider-color, rgba(127,127,127,.35)); }
.ctc-ed .hint { font-size:13px; color:var(--secondary-text-color); margin:0 0 14px; }
.ctc-ed .kopje { margin:20px 0 8px; font-size:12px; font-weight:500; letter-spacing:.07em;
  text-transform:uppercase; color:var(--secondary-text-color); }
.ctc-ed .kopje:first-child { margin-top:0; }
.ctc-ed .strip { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.ctc-ed .chip { display:inline-flex; align-items:center; gap:6px; padding:7px 14px; border-radius:18px;
  border:1px solid var(--ctc-rand); background:transparent; color:var(--primary-text-color);
  font:inherit; font-size:14px; line-height:1; cursor:pointer; }
.ctc-ed .chip:hover { background:var(--secondary-background-color); }
.ctc-ed .chip.aan { background:var(--primary-color); color:var(--text-primary-color,#fff);
  border-color:transparent; }
.ctc-ed .chip.aan:hover { background:var(--primary-color); }
.ctc-ed .chip ha-icon { --mdc-icon-size:18px; width:18px; height:18px; }
.ctc-ed .chip.stippel { border-style:dashed; color:var(--primary-color); }
.ctc-ed .paneel { border:1px solid var(--ctc-rand); border-radius:14px; padding:6px 16px 16px;
  margin-top:12px; }
.ctc-ed .balk { display:flex; align-items:center; gap:4px; min-height:44px; }
.ctc-ed .balk .titel { flex:1; font-size:15px; overflow:hidden; text-overflow:ellipsis;
  white-space:nowrap; }
.ctc-ed .balk .titel small { display:block; font-size:12px; color:var(--secondary-text-color); }
.ctc-ed .knop { display:inline-flex; align-items:center; justify-content:center; width:36px; height:36px;
  flex:none; border:none; border-radius:50%; background:transparent;
  color:var(--secondary-text-color); cursor:pointer; padding:0; }
.ctc-ed .knop:hover { background:var(--secondary-background-color); color:var(--primary-text-color); }
.ctc-ed .knop[disabled] { opacity:.28; cursor:default; background:transparent; }
.ctc-ed .knop ha-icon { --mdc-icon-size:20px; width:20px; height:20px; }
.ctc-ed .knop.rood:hover { color:var(--error-color,#db4437); }
.ctc-ed .cam { border:1px solid var(--ctc-rand); border-radius:12px; margin-bottom:8px;
  overflow:hidden; }
.ctc-ed .cam.open { border-color:var(--primary-color); }
.ctc-ed .cam > .balk { padding:2px 6px 2px 14px; cursor:pointer; }
.ctc-ed .cam > .balk:hover { background:var(--secondary-background-color); }
.ctc-ed .cam > .lijf { padding:8px 16px 14px; border-top:1px solid var(--ctc-rand); }
.ctc-ed .vlag { font-size:11px; padding:3px 9px; border-radius:10px; flex:none;
  background:var(--secondary-background-color); color:var(--secondary-text-color); }
.ctc-ed .leeg { color:var(--secondary-text-color); font-size:13px; padding:10px 0 4px; }
.ctc-ed .scheiding { height:1px; background:var(--ctc-rand); margin:16px -16px 0; }
`;

function ctcKloon(o) {
  return o == null ? o : JSON.parse(JSON.stringify(o));
}

class TouchCameraCardEditor extends HTMLElement {
  setConfig(config) {
    // After a change of our own we get our own configuration back. Do not rebuild
    // then: that would remove the field you are typing in.
    if (this._eigen) {
      this._eigen = false;
      this._config = ctcSleutels(ctcKloon(config), SLEUTELS) || {};
      return;
    }
    this._config = ctcSleutels(ctcKloon(config), SLEUTELS) || {};
    if (!Array.isArray(this._config.tabs)) this._config.tabs = [];
    this._tab = Math.min(this._tab || 0, Math.max(0, this._config.tabs.length - 1));
    this._openCam = null;
    this._bouw();
  }

  set hass(h) {
    const eerste = !this._hass;
    this._hass = h;
    (this._formulieren || []).forEach((f) => { f.hass = h; });
    if (eerste && this._taal && this._taal !== ctcTaal(h)) this._bouw();
  }

  // ---------- building up ----------

  _bouw() {
    this._formulieren = [];
    this.innerHTML = '';

    const stijl = document.createElement('style');
    stijl.textContent = STIJL;
    this.appendChild(stijl);

    const wrap = document.createElement('div');
    wrap.className = 'ctc-ed';
    this.appendChild(wrap);

    wrap.appendChild(this._kopje(ctcT(this._taal, 'tabs')));
    wrap.appendChild(this._tabStrip());

    const tabs = this._config.tabs;
    if (tabs.length) {
      wrap.appendChild(this._tabPaneel(tabs[this._tab] || {}));
    } else {
      wrap.appendChild(this._tekst('leeg', ctcT(this._taal, 'notabs')));
    }

    wrap.appendChild(this._kopje(ctcT(this._taal, 'general')));
    wrap.appendChild(this._form(SCHEMA, this._algemeenData(), (e) => this._algemeenGewijzigd(e)));
  }

  _kopje(tekst) {
    const d = document.createElement('div');
    d.className = 'kopje';
    d.textContent = tekst;
    return d;
  }

  _tekst(klasse, tekst) {
    const d = document.createElement('div');
    d.className = klasse;
    d.textContent = tekst;
    return d;
  }

  _knop(icoon, titel, aan, klasse) {
    const b = document.createElement('button');
    b.className = 'knop' + (klasse ? ' ' + klasse : '');
    b.title = titel;
    b.type = 'button';
    const i = document.createElement('ha-icon');
    i.setAttribute('icon', icoon);
    b.appendChild(i);
    b.addEventListener('click', (e) => { e.stopPropagation(); aan(); });
    return b;
  }

  _form(schema, data, aan) {
    const f = document.createElement('ha-form');
    if (this._hass) f.hass = this._hass;
    const taal = ctcTaal(this._hass);
    this._taal = taal;
    const L = taal === 'nl' ? LABELS_NL : LABELS_EN;
    // The headings of the folded-out sections are their own field: ha-form asks for
    // them through the title, not through a name, so they are translated here.
    f.schema = taal === 'nl' ? schema : schema.map((s) => (s && s.title && KOPPEN_EN[s.title]
      ? Object.assign({}, s, { title: KOPPEN_EN[s.title] }) : s));
    f.data = data;
    f.computeLabel = (s) => L[s.name] || LABELS_EN[s.name] || s.title || s.name;
    f.addEventListener('value-changed', aan);
    this._formulieren.push(f);
    return f;
  }

  // ---------- tabs ----------

  _tabStrip() {
    const strip = document.createElement('div');
    strip.className = 'strip';
    this._config.tabs.forEach((t, i) => {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'chip' + (i === this._tab ? ' aan' : '');
      if (t.icon) {
        const ic = document.createElement('ha-icon');
        ic.setAttribute('icon', t.icon);
        c.appendChild(ic);
      }
      const sp = document.createElement('span');
      sp.textContent = t.naam || ctcT(this._taal, 'tab') + ' ' + (i + 1);
      c.appendChild(sp);
      c.addEventListener('click', () => { this._tab = i; this._openCam = null; this._bouw(); });
      strip.appendChild(c);
    });

    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'chip stippel';
    const pi = document.createElement('ha-icon');
    pi.setAttribute('icon', 'mdi:plus');
    plus.appendChild(pi);
    const ps = document.createElement('span');
    ps.textContent = ctcT(this._taal, 'addtab');
    plus.appendChild(ps);
    plus.addEventListener('click', () => this._tabToevoegen());
    strip.appendChild(plus);

    return strip;
  }

  _tabPaneel(tab) {
    const p = document.createElement('div');
    p.className = 'paneel';

    const balk = document.createElement('div');
    balk.className = 'balk';
    const titel = document.createElement('div');
    titel.className = 'titel';
    titel.textContent = tab.naam || ctcT(this._taal, 'tab') + ' ' + (this._tab + 1);
    balk.appendChild(titel);
    balk.appendChild(this._knop('mdi:arrow-left', ctcT(this._taal, 'moveleft'), () => this._tabVerplaats(-1)))
      .disabled = this._tab === 0;
    balk.appendChild(this._knop('mdi:arrow-right', ctcT(this._taal, 'moveright'), () => this._tabVerplaats(1)))
      .disabled = this._tab >= this._config.tabs.length - 1;
    balk.appendChild(this._knop('mdi:delete-outline', ctcT(this._taal, 'deltab'),
      () => this._tabVerwijder(), 'rood'));
    p.appendChild(balk);

    p.appendChild(this._form(TAB_SCHEMA, {
      naam: tab.naam || '',
      icon: tab.icon || '',
      meldingen: tab.meldingen !== false,
      wisselen: !!tab.wisselen,
      raster: tab.raster,
    }, (e) => this._tabGewijzigd(e, titel)));

    const scheiding = document.createElement('div');
    scheiding.className = 'scheiding';
    p.appendChild(scheiding);

    p.appendChild(this._kopje(ctcT(this._taal, 'camsontab')));
    const cams = tab.cameras || [];
    if (!cams.length) {
      p.appendChild(this._tekst('leeg', ctcT(this._taal, 'nocams')));
    }
    cams.forEach((c, i) => p.appendChild(this._camRij(c, i, cams.length)));

    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'chip stippel';
    const pi = document.createElement('ha-icon');
    pi.setAttribute('icon', 'mdi:plus');
    plus.appendChild(pi);
    const ps = document.createElement('span');
    ps.textContent = ctcT(this._taal, 'addcam');
    plus.appendChild(ps);
    plus.addEventListener('click', () => this._camToevoegen());
    p.appendChild(plus);

    return p;
  }

  _tabToevoegen() {
    this._config.tabs.push({ naam: 'Nieuw tabblad', icon: 'mdi:cctv', cameras: [] });
    this._tab = this._config.tabs.length - 1;
    this._openCam = null;
    this._bouw();
    this._stuur();
  }

  _tabVerplaats(richting) {
    const t = this._config.tabs;
    const doel = this._tab + richting;
    if (doel < 0 || doel >= t.length) return;
    const x = t[this._tab];
    t[this._tab] = t[doel];
    t[doel] = x;
    this._tab = doel;
    this._bouw();
    this._stuur();
  }

  _tabVerwijder() {
    this._config.tabs.splice(this._tab, 1);
    this._tab = Math.max(0, this._tab - 1);
    this._openCam = null;
    this._bouw();
    this._stuur();
  }

  _tabGewijzigd(e, titelEl) {
    e.stopPropagation();
    const v = e.detail.value;
    const t = this._config.tabs[this._tab];
    if (!t) return;
    t.naam = v.naam || '';
    if (v.icon) t.icon = v.icon; else delete t.icon;
    if (v.meldingen === false) t.meldingen = false; else delete t.meldingen;
    if (v.wisselen) t.wisselen = true; else delete t.wisselen;
    if (v.raster) t.raster = v.raster; else delete t.raster;
    if (titelEl) titelEl.textContent = t.naam || ctcT(this._taal, 'tab') + ' ' + (this._tab + 1);
    const chip = this.querySelector('.strip .chip.aan span');
    if (chip) chip.textContent = t.naam || ctcT(this._taal, 'tab') + ' ' + (this._tab + 1);
    this._stuur();
  }

  // ---------- cameras ----------

  _camRij(cam, i, aantal) {
    const open = this._openCam === i;
    const rij = document.createElement('div');
    rij.className = 'cam' + (open ? ' open' : '');

    const balk = document.createElement('div');
    balk.className = 'balk';
    balk.addEventListener('click', () => {
      this._openCam = open ? null : i;
      this._bouw();
    });

    const pijl = document.createElement('ha-icon');
    pijl.setAttribute('icon', open ? 'mdi:chevron-down' : 'mdi:chevron-right');
    pijl.style.cssText = 'margin-right:8px;color:var(--secondary-text-color)';
    balk.appendChild(pijl);

    const titel = document.createElement('div');
    titel.className = 'titel';
    titel.textContent = cam.naam || 'Camera ' + (i + 1);
    const sub = document.createElement('small');
    sub.textContent = cam.entity || (cam.weer ? ctcT(this._taal, 'radarsrc') + cam.weer : cam.kaart ? ctcT(this._taal, 'owncard') : ctcT(this._taal, 'nocam'));
    titel.appendChild(sub);
    balk.appendChild(titel);

    if (cam.groot) {
      const v = document.createElement('span');
      v.className = 'vlag';
      v.textContent = ctcT(this._taal, 'big');
      balk.appendChild(v);
    }

    balk.appendChild(this._knop('mdi:arrow-up', ctcT(this._taal, 'moveup'), () => this._camVerplaats(i, -1)))
      .disabled = i === 0;
    balk.appendChild(this._knop('mdi:arrow-down', ctcT(this._taal, 'movedown'), () => this._camVerplaats(i, 1)))
      .disabled = i >= aantal - 1;
    balk.appendChild(this._knop('mdi:delete-outline', ctcT(this._taal, 'delcam'),
      () => this._camVerwijder(i), 'rood'));
    rij.appendChild(balk);

    if (open) {
      const lijf = document.createElement('div');
      lijf.className = 'lijf';
      lijf.appendChild(this._form(CAM_SCHEMA, {
        entity: cam.entity || '',
        naam: cam.naam || '',
        groot: !!cam.groot,
        beweging: cam.beweging || '',
        persoon: cam.persoon || '',
        ververs: cam.ververs,
        bijsnijden: cam.bijsnijden !== false,
        verhouding: cam.verhouding || '',
      }, (e) => this._camGewijzigd(e, i, titel, sub, balk)));
      rij.appendChild(lijf);
    }

    return rij;
  }

  _camLijst() {
    const t = this._config.tabs[this._tab];
    if (!t) return null;
    if (!Array.isArray(t.cameras)) t.cameras = [];
    return t.cameras;
  }

  _camToevoegen() {
    const lijst = this._camLijst();
    if (!lijst) return;
    lijst.push({ naam: '', entity: '' });
    this._openCam = lijst.length - 1;
    this._bouw();
    this._stuur();
  }

  _camVerplaats(i, richting) {
    const lijst = this._camLijst();
    const doel = i + richting;
    if (!lijst || doel < 0 || doel >= lijst.length) return;
    const x = lijst[i];
    lijst[i] = lijst[doel];
    lijst[doel] = x;
    if (this._openCam === i) this._openCam = doel;
    else if (this._openCam === doel) this._openCam = i;
    this._bouw();
    this._stuur();
  }

  _camVerwijder(i) {
    const lijst = this._camLijst();
    if (!lijst) return;
    lijst.splice(i, 1);
    this._openCam = null;
    this._bouw();
    this._stuur();
  }

  _camGewijzigd(e, i, titelEl, subEl, balkEl) {
    e.stopPropagation();
    const lijst = this._camLijst();
    if (!lijst || !lijst[i]) return;
    const v = e.detail.value;
    const cam = lijst[i];

    ['entity', 'naam', 'beweging', 'persoon', 'verhouding'].forEach((k) => {
      if (v[k]) cam[k] = v[k]; else delete cam[k];
    });
    if (v.ververs === '' || v.ververs == null) delete cam.ververs; else cam.ververs = v.ververs;
    if (v.groot) cam.groot = true; else delete cam.groot;
    if (v.bijsnijden === false) cam.bijsnijden = false; else delete cam.bijsnijden;

    if (titelEl) titelEl.firstChild.textContent = cam.naam || 'Camera ' + (i + 1);
    if (subEl) subEl.textContent = cam.entity || (cam.weer ? ctcT(this._taal, 'radarsrc') + cam.weer : cam.kaart ? ctcT(this._taal, 'owncard') : ctcT(this._taal, 'nocam'));
    if (balkEl) {
      const bestaand = balkEl.querySelector('.vlag');
      if (cam.groot && !bestaand) {
        const vl = document.createElement('span');
        vl.className = 'vlag';
        vl.textContent = ctcT(this._taal, 'big');
        balkEl.insertBefore(vl, balkEl.querySelector('.knop'));
      } else if (!cam.groot && bestaand) {
        bestaand.remove();
      }
    }
    this._stuur();
  }

  // ---------- general settings ----------

  _algemeenData() {
    const c = this._config;
    const d = {};
    Object.keys(STANDAARD).forEach((k) => {
      d[k] = c[k] === undefined ? STANDAARD[k] : c[k];
    });
    ['hoogte', 'vul_marge', 'melding_breedte'].forEach((k) => {
      if (c[k] !== undefined) d[k] = c[k];
    });
    return d;
  }

  _algemeenGewijzigd(e) {
    e.stopPropagation();
    const v = e.detail.value;
    Object.keys(v).forEach((k) => {
      const w = v[k];
      if (w === undefined || w === '' || w === null) delete this._config[k];
      else if (STANDAARD[k] !== undefined && w === STANDAARD[k]) delete this._config[k];
      else this._config[k] = w;
    });
    this._stuur();
  }

  // ---------- passing on ----------

  _stuur() {
    const nieuw = ctcSleutels(ctcKloon(this._config), SLEUTELS_TERUG);
    this._eigen = true;
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: nieuw }, bubbles: true, composed: true,
    }));
  }
}

customElements.define('touch-camera-card-editor', TouchCameraCardEditor);

// ---------------------------------------------------------------------------
// touch-camera-tile
//
// One camera, one tile, and nothing around it. The same engine as the card above:
// the same snapshot timer and the same watchdog, but without tabs, notifications
// or a large view, because none of that belongs on a tile between other cards.
//
// It exists because Home Assistant's own picture card takes its image from a loop
// that can quietly stop on a page that stays open for days. The rest of the
// dashboard carries on, so nobody notices: the last frame simply stays there.
// ---------------------------------------------------------------------------

const TEGEL_SCHEMA = [
  { name: 'entity', selector: { entity: { filter: [{ domain: 'camera' }] } } },
  { name: 'naam', selector: { text: {} } },
  {
    name: '', type: 'grid', schema: [
      { name: 'beweging', selector: { entity: { filter: [{ domain: 'binary_sensor' }] } } },
      { name: 'persoon', selector: { entity: { filter: [{ domain: 'binary_sensor' }] } } },
    ],
  },
  { name: 'grijs', selector: { boolean: {} } },
  {
    name: '', type: 'grid', schema: [
      { name: 'rondte', selector: { number: { min: 0, max: 60, step: 2, mode: 'box', unit_of_measurement: 'px' } } },
      { name: 'rand', selector: { number: { min: 0, max: 24, step: 1, mode: 'box', unit_of_measurement: 'px' } } },
    ],
  },
  {
    name: '', type: 'expandable', title: 'Meer instellingen', icon: 'mdi:tune',
    schema: [
      { name: 'ververs', selector: { number: { min: 0.5, max: 600, step: 0.5, mode: 'box', unit_of_measurement: 's' } } },
      { name: 'bijsnijden', selector: { boolean: {} } },
      { name: 'verhouding', selector: { text: {} } },
      { name: 'navigeren', selector: { text: {} } },
    ],
  },
];

// Home Assistant hands the editor its configuration before it hands over hass, so
// the first build happens without knowing the language. Both editors rebuild once
// it turns out to be a different one than they drew.
function ctcTaal(h) {
  return String((h && (h.language || (h.locale && h.locale.language))) || 'en').slice(0, 2);
}

function ctcZonderLeeg(o) {
  const uit = {};
  Object.keys(o).forEach((k) => { if (o[k] !== undefined) uit[k] = o[k]; });
  return uit;
}

class TouchCameraTile extends TouchCameraCard {
  setConfig(config) {
    const c = ctcSleutels(config, SLEUTELS) || {};
    if (!c.entity) throw new Error('touch-camera-tile: "entity" is missing');
    super.setConfig(ctcZonderLeeg({
      kaal: true,
      meldingen: false,
      grijs: c.grijs,
      rondte: c.rondte,
      rand: c.rand,
      navigeren: c.navigeren,
      ververs: c.ververs,
      tabs: [{
        naam: '',
        meldingen: false,
        cameras: [ctcZonderLeeg({
          entity: c.entity,
          naam: c.naam,
          groot: true,
          bijsnijden: c.bijsnijden,
          verhouding: c.verhouding,
          beweging: c.beweging,
          persoon: c.persoon,
        })],
      }],
    }));
  }

  getCardSize() { return 4; }

  static getConfigElement() {
    return document.createElement('touch-camera-tile-editor');
  }

  static getStubConfig(hass) {
    const cam = Object.keys((hass && hass.states) || {}).find(e => e.startsWith('camera.'));
    return { entity: cam || '' };
  }
}

customElements.define('touch-camera-tile', TouchCameraTile);

window.customCards.push({
  type: 'touch-camera-tile',
  name: 'Touch camera tile',
  description: 'One camera as a single tile, with a snapshot timer and a watchdog instead of a stream that can stall unnoticed',
});

class TouchCameraTileEditor extends HTMLElement {
  setConfig(config) {
    // Same guard as the other editor: our own change comes straight back to us,
    // and rebuilding then would take away the field being typed in.
    if (this._eigen) { this._eigen = false; return; }
    this._config = ctcSleutels(ctcKloon(config), SLEUTELS) || {};
    this._bouw();
  }

  set hass(h) {
    const eerste = !this._hass;
    this._hass = h;
    if (this._f) this._f.hass = h;
    if (eerste && this._taal && this._taal !== ctcTaal(h)) this._bouw();
  }

  _bouw() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = '';
    const f = document.createElement('ha-form');
    if (this._hass) f.hass = this._hass;
    const taal = ctcTaal(this._hass);
    this._taal = taal;
    const L = taal === 'nl' ? LABELS_NL : LABELS_EN;
    f.schema = taal === 'nl' ? TEGEL_SCHEMA : TEGEL_SCHEMA.map((s) => (s && s.title && KOPPEN_EN[s.title]
      ? Object.assign({}, s, { title: KOPPEN_EN[s.title] }) : s));
    f.data = this._config;
    f.computeLabel = (s) => L[s.name] || LABELS_EN[s.name] || s.title || s.name;
    f.addEventListener('value-changed', (e) => {
      this._config = Object.assign({}, this._config, e.detail.value);
      this._stuur();
    });
    this._f = f;
    this.shadowRoot.appendChild(f);
  }

  _stuur() {
    const nieuw = ctcSleutels(ctcKloon(this._config), SLEUTELS_TERUG);
    this._eigen = true;
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: nieuw }, bubbles: true, composed: true,
    }));
  }
}

customElements.define('touch-camera-tile-editor', TouchCameraTileEditor);
