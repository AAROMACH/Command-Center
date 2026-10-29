import type { Material } from './types';

/**
 * A starter price book of standard low-voltage materials (Assets & Materials →
 * Materials → "Load standard materials"). Names, categories and units only —
 * costs start at $0 for the office to fill in. Loading skips any name already
 * in the price book, so it's safe to run again.
 */
type Std = { name: string; category: string; unitType: Material['unitType']; description?: string };

const C = (category: string, unitType: Material['unitType'], names: string[], description?: string): Std[] =>
  names.map(name => ({ name, category, unitType, ...(description ? { description } : {}) }));

export const STANDARD_MATERIALS: Std[] = [
  // ── Cable & Wire ──
  ...C('Cable & Wire', 'foot', [
    'Cat5e CMR cable', 'Cat5e CMP (plenum) cable', 'Cat6 CMR cable', 'Cat6 CMP (plenum) cable',
    'Cat6 outdoor / direct burial cable', 'Cat6A CMR cable', 'Cat6A CMP (plenum) cable', 'Cat6 shielded (STP) cable',
    'RG6 coax cable', 'RG59 siamese (video + power) cable', '18/2 power cable', '18/4 alarm / control cable',
    '22/4 alarm cable', '22/2 shielded cable', '16/2 speaker wire (CL2/CL3)', '14/2 speaker wire (CL2/CL3)',
    '16/4 speaker wire', 'HDMI-rated in-wall cable', 'Plenum access control composite cable', 'Fire alarm cable (FPLP) 18/2',
  ]),
  ...C('Cable & Wire', 'box', ['Cat6 CMR cable (1000 ft box)', 'Cat6 CMP cable (1000 ft box)', 'Cat6A CMP cable (1000 ft reel)']),
  ...C('Cable & Wire', 'each', [
    'Cat6 patch cable 1 ft', 'Cat6 patch cable 3 ft', 'Cat6 patch cable 5 ft', 'Cat6 patch cable 7 ft',
    'Cat6 patch cable 10 ft', 'Cat6 patch cable 14 ft', 'Cat6 patch cable 25 ft', 'Cat6A patch cable 3 ft',
    'Cat6A patch cable 7 ft', 'HDMI cable 6 ft', 'HDMI cable 15 ft', 'HDMI cable 25 ft',
  ]),

  // ── Fiber ──
  ...C('Fiber', 'foot', [
    'Single-mode fiber 6-strand (OS2) indoor/outdoor', 'Single-mode fiber 12-strand (OS2) indoor/outdoor',
    'Multimode fiber 6-strand (OM3)', 'Multimode fiber 12-strand (OM4)', 'Armored fiber 12-strand',
    'Innerduct 1"', 'Fiber pull string / mule tape',
  ]),
  ...C('Fiber', 'each', [
    'LC-LC single-mode duplex patch cord 1 m', 'LC-LC single-mode duplex patch cord 3 m', 'LC-LC multimode duplex patch cord 3 m',
    'SC-LC single-mode patch cord 3 m', 'LC fiber connector (field-installable)', 'SC fiber connector (field-installable)',
    'Fiber pigtail LC single-mode', 'Fiber splice protection sleeve', 'Fiber adapter panel 6-port LC duplex',
    'Fiber adapter panel 12-port LC duplex', 'Rack-mount fiber enclosure 1U', 'Rack-mount fiber enclosure 2U',
    'Wall-mount fiber enclosure', 'Fiber splice tray', 'SFP module 1G single-mode LX', 'SFP module 1G multimode SX',
    'SFP+ module 10G single-mode LR', 'SFP+ module 10G multimode SR', 'Media converter (fiber to copper)',
  ]),

  // ── Connectivity ──
  ...C('Connectivity', 'each', [
    'Cat6 keystone jack', 'Cat6A keystone jack', 'Cat5e keystone jack', 'Cat6 shielded keystone jack',
    'RJ45 Cat6 plug (pass-through)', 'RJ45 Cat6A plug', 'RJ45 Cat6 shielded plug', 'RJ45 field-terminated plug (for cameras / APs)',
    'RJ45 boot', 'Coax F-connector (compression) RG6', 'BNC connector (compression) RG59', 'Blank keystone insert',
    'Wall plate 1-port', 'Wall plate 2-port', 'Wall plate 4-port', 'Wall plate 6-port',
    'Surface-mount box 1-port', 'Surface-mount box 2-port', 'Biscuit jack (surface mount)', 'HDMI keystone insert',
    'Patch panel 24-port Cat6', 'Patch panel 48-port Cat6', 'Patch panel 24-port Cat6A', 'Patch panel 24-port blank (keystone)',
    'Inline coupler RJ45 Cat6', 'Weatherproof outdoor RJ45 coupler', '110 punch-down block', '66 punch-down block',
    'Low-voltage mounting bracket (single gang)', 'Low-voltage mounting bracket (double gang)',
  ]),

  // ── Racks & Enclosures ──
  ...C('Racks & Enclosures', 'each', [
    '2-post open frame rack 42U', '4-post open frame rack 42U', 'Wall-mount open rack 12U', 'Wall-mount enclosed cabinet 6U',
    'Wall-mount enclosed cabinet 12U', 'Floor-standing enclosed cabinet 42U', 'Swing-out wall rack 12U',
    'Horizontal cable manager 1U', 'Horizontal cable manager 2U', 'Vertical cable manager', 'Rack shelf 1U (vented)',
    'Rack shelf 2U (cantilever)', 'Blank panel 1U', 'Blank panel 2U', 'Rack PDU 8-outlet', 'Rack UPS 1500VA',
    'Rack UPS 3000VA', 'Rack fan / ventilation kit', 'Rack screws and cage nuts (pack of 50)', 'Ladder rack 12" (10 ft section)',
    'Ladder rack wall angle kit', 'Structured media enclosure 14"', 'Structured media enclosure 28"', 'NEMA 4X outdoor enclosure',
  ]),

  // ── Network Equipment ──
  ...C('Network Equipment', 'each', [
    'Unmanaged switch 8-port', 'Unmanaged PoE switch 8-port', 'Managed switch 24-port', 'Managed PoE+ switch 24-port',
    'Managed PoE+ switch 48-port', 'Managed PoE+ switch 8-port', 'PoE injector (802.3at)', 'PoE injector (802.3bt)',
    'PoE extender', 'Firewall / router (small business)', 'Wireless access point (indoor, Wi-Fi 6)', 'Wireless access point (outdoor)',
    'Wireless access point mounting bracket', 'Point-to-point wireless bridge kit', 'Network video recorder (NVR) 8-channel',
    'Network video recorder (NVR) 16-channel', 'Network video recorder (NVR) 32-channel', 'Surveillance hard drive 4TB',
    'Surveillance hard drive 8TB', 'Network surge protector (Ethernet)',
  ]),

  // ── Cameras & Security ──
  ...C('Cameras & Security', 'each', [
    'IP dome camera 4MP', 'IP dome camera 8MP (4K)', 'IP turret camera 4MP', 'IP bullet camera 4MP',
    'IP bullet camera 8MP (4K)', 'IP PTZ camera', 'IP fisheye / panoramic camera', 'License plate recognition (LPR) camera',
    'Camera junction box', 'Camera wall mount bracket', 'Camera pole mount adapter', 'Camera corner mount adapter',
    'Camera pendant mount', 'Video doorbell / intercom station', 'Access control panel (2-door)', 'Access control panel (4-door)',
    'Card reader (proximity / mobile)', 'Keypad reader', 'Access cards (pack of 50)', 'Key fobs (pack of 25)',
    'Electric strike', 'Mag lock 600 lb', 'Request-to-exit (REX) motion sensor', 'Request-to-exit push button',
    'Door position switch', 'Access control power supply 12/24V', 'Intrusion alarm panel', 'Motion detector (PIR)',
    'Door / window contact', 'Glass break detector', 'Alarm keypad', 'Alarm siren / strobe',
  ]),

  // ── Audio/Visual ──
  ...C('Audio/Visual', 'each', [
    'In-ceiling speaker 6.5"', 'In-ceiling speaker 8"', 'Pendant speaker', 'Surface-mount speaker',
    'Outdoor speaker', 'Commercial amplifier (70V)', 'Mixer amplifier', 'Volume control (70V)',
    'Wall-mount TV bracket (fixed)', 'Wall-mount TV bracket (tilt)', 'Wall-mount TV bracket (full motion)', 'Ceiling projector mount',
    'HDMI extender over Cat6 (pair)', 'HDMI splitter 1x4', 'HDMI matrix switch 4x4', 'Wireless presentation system',
    'Conference room camera', 'Conference speakerphone', 'Recessed TV / AV box', 'Wall plate HDMI + USB',
  ]),

  // ── Automation & Controls ──
  ...C('Automation & Controls', 'each', [
    'PLC (compact)', 'PLC I/O module (digital)', 'PLC I/O module (analog)', 'HMI touch panel 7"',
    'HMI touch panel 10"', '24VDC DIN rail power supply', 'DIN rail (1 m)', 'Terminal block (DIN rail)',
    'Terminal block end stop', 'Control relay (DIN rail)', 'Contactor', 'Proximity sensor (inductive)',
    'Photoelectric sensor', 'Limit switch', 'Pushbutton (22 mm)', 'Emergency stop pushbutton',
    'Pilot light (22 mm)', 'Selector switch (22 mm)', 'Industrial Ethernet switch (DIN rail)', 'Control panel enclosure',
    'Wire duct (2 m)', 'Ferrules (pack of 500)',
  ]),

  // ── Hardware & Supplies ──
  ...C('Hardware & Supplies', 'pack', [
    'Cable ties 8" (pack of 100)', 'Cable ties 11" (pack of 100)', 'Velcro cable wraps (roll)', 'Cable staples (pack of 100)',
    'Drywall anchors (pack of 100)', 'Tapcon concrete screws (pack of 100)', 'Wood screws (pack of 100)', 'Zip tie mounts (pack of 100)',
  ]),
  ...C('Hardware & Supplies', 'each', [
    'J-hook 2"', 'J-hook 4"', 'Bridle ring', 'Beam clamp', 'Ceiling wire hanger (10 ft)',
    'Cable support bag / sling', 'Old-work low-voltage ring (single gang)', 'Old-work box (single gang)', 'Surface raceway (5 ft)',
    'Surface raceway fittings', 'Flexible conduit (ENT) 3/4"', 'EMT conduit 3/4" (10 ft)', 'EMT conduit 1" (10 ft)',
    'EMT connector / coupling', 'Conduit bushing', 'Fire-rated sleeve / pathway device', 'Firestop putty pad',
    'Firestop sealant (tube)', 'Grommet / bushing', 'Weatherproof box', 'Silicone sealant (tube)',
    'Electrical tape (roll)', 'Cable labels (roll)', 'Heat shrink tubing assortment', 'Wire nuts / connectors (pack)',
    'Fish tape', 'Pull string (roll)', 'Cable lubricant', 'Plywood backboard 4x8 (fire-rated)', 'Grounding bar / bus bar',
    'Ground wire #6 (per foot)',
  ]),
  ...C('Hardware & Supplies', 'roll', ['Velcro roll (75 ft)', 'Caution tape (roll)']),
];
