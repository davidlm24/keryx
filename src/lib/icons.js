// The app's icons (Rodada HI, owner 19/10): Lucide's drawings under the
// names the code has always used. Each icon is a node, the format of the
// vanilla `lucide` package: a list of [tag, attrs] drawn in a 24-unit box
// with no fill, round caps and joins. Only the icons mapped here are
// imported, so the bundle carries these and no others.
//
// A new icon is one import and one entry in ICON_NODES, never an inline SVG.
// Three are our own (Lucide has no twin): black (Tela preta), logo (the Logo
// on screen) and synced (a song synced to its media), drawn in the same
// format and box as Lucide's.
import {
    AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowLeft, ArrowRight, Bell, Book, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight,
    ChevronUp, ChevronsDownUp, ChevronsUpDown, Circle, CircleHelp, Clock, Cloud, Columns2, Copy, CornerDownLeft, Download,
    Ellipsis, Eraser, ExternalLink, Eye, EyeOff, Film, Folder, Footprints, Globe, GripVertical, History, Image, Info,
    Keyboard, Layers, LayoutGrid, LayoutPanelLeft, Library, Link, List, ListChecks, Lock, LockOpen, Megaphone, Menu, MessageSquare, Minus, Monitor, Music,
    Palette, Pause, Pencil, Pin, Play, Plus, Power, Presentation, Projector, Redo2, RefreshCw, Rows2, Save,
    Search, SendHorizontal, SkipBack, SkipForward, SlidersHorizontal, Square, Star, Tablet, Trash2, TriangleAlert, Tv,
    Type, Undo2, User, Volume2, VolumeX, Wifi, WifiOff, X, Youtube,
} from "lucide";

// The stroke at 16 px, in the 24-unit box (1.5 = one pixel; Lucide's own
// default is 2). The owner may move it to 2: this is the one place.
export const STROKE = 1.5;

// Tela preta: a screen with a slash across it.
const Black = [
    ["rect", { x: "2", y: "4", width: "20", height: "15", rx: "2" }],
    ["path", { d: "m5 16.5 14-10" }],
];
// The Logo on screen: a K in a circle.
const Logo = [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["path", { d: "M9 7.5v9M15 7.5 9 12l6 4.5" }],
];
// A song synced to its media (Sincronizar): lyrics lines with a clock.
const Synced = [
    ["path", { d: "M3 6h12M3 11h8M3 16h5" }],
    ["circle", { cx: "17", cy: "16", r: "5" }],
    ["path", { d: "M17 13.5V16l1.5 1" }],
];

export const ICON_NODES = {
    search: Search,
    play: Play,
    pause: Pause,
    "skip-back": SkipBack,
    "skip-fwd": SkipForward,
    black: Black,
    logo: Logo,
    edit: Pencil,
    eraser: Eraser,
    stop: Square,
    power: Power,
    eye: Eye,
    "eye-off": EyeOff,
    lock: Lock,
    unlock: LockOpen,
    "chevron-down": ChevronDown,
    "chevron-right": ChevronRight,
    "chevron-left": ChevronLeft,
    "chevron-up": ChevronUp,
    more: Ellipsis,
    grip: GripVertical,
    music: Music,
    film: Film,
    megaphone: Megaphone,
    book: Book,
    list: List,
    listChecks: ListChecks,
    layers: Layers,
    clock: Clock,
    check: Check,
    checks: CheckCheck,
    warn: TriangleAlert,
    x: X,
    plus: Plus,
    minus: Minus,
    undo: Undo2,
    redo: Redo2,
    monitor: Monitor,
    tablet: Tablet,
    projector: Projector,
    tv: Tv,
    volume: Volume2,
    "volume-off": VolumeX,
    folder: Folder,
    keyboard: Keyboard,
    palette: Palette,
    cols: Columns2,
    rows: Rows2,
    sliders: SlidersHorizontal,
    user: User,
    wifi: Wifi,
    "wifi-off": WifiOff,
    collapse: ChevronsDownUp,
    expand: ChevronsUpDown,
    "arrow-right": ArrowRight,
    "arrow-left": ArrowLeft,
    "corner-down-left": CornerDownLeft,
    image: Image,
    text: Type,
    refresh: RefreshCw,
    save: Save,
    external: ExternalLink,
    star: Star,
    history: History,
    dot: Circle,
    bell: Bell,
    download: Download,
    globe: Globe,
    grid: LayoutGrid,
    panels: LayoutPanelLeft,
    menu: Menu,
    steps: Footprints,
    trash: Trash2,
    copy: Copy,
    info: Info,
    help: CircleHelp,
    pin: Pin,
    cloud: Cloud,
    media: Library,
    presentation: Presentation,
    youtube: Youtube,
    synced: Synced,
    // The Equipe on the phone (Rodada Q PR4): its chat, a link, send.
    chat: MessageSquare,
    link: Link,
    send: SendHorizontal,
    // The text bar's alignment (Rodada P, P8-1).
    alignLeft: AlignLeft,
    alignCenter: AlignCenter,
    alignRight: AlignRight,
    alignJustify: AlignJustify,
};

export const ICON_NAMES = Object.keys(ICON_NODES);

// The node for a name, or null (an unknown name draws nothing).
export const iconNode = (name) => (Object.hasOwn(ICON_NODES, name) ? ICON_NODES[name] : null);

// The stroke in the box at a given size: STROKE at 16 px, scaled so the
// line keeps the same width on screen at any size (a 12 px mark at 1.5
// drew 0.75 px, faint; POL-15).
export const strokeFor = (size) => String(Math.round(((STROKE * 16) / size) * 100) / 100);

const escAttr = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// The glyph as SVG markup, for a node built outside React (the drag ghost).
export function iconMarkup(name, size = 16) {
    const node = iconNode(name);
    if (!node) return "";
    const kids = node.map(([tag, attrs]) => `<${tag}${Object.entries(attrs).map(([k, v]) => ` ${k}="${escAttr(v)}"`).join("")}/>`).join("");
    return `<svg class="kx-i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeFor(size)}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${kids}</svg>`;
}
