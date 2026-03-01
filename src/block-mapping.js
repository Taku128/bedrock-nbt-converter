/**
 * bedrock-nbt-converter/src/block-mapping.js
 * 
 * Maps Bedrock block names and properties to Java-compatible format.
 * Uses Chunker-derived name mappings as primary lookup, with manual
 * property conversion rules for block states.
 */
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Load Chunker-derived mappings ──
let chunkerNames = {};
let chunkerFlatten = {};
try {
  const p = resolve(__dirname, '..', 'data', 'chunker-mappings.json');
  if (existsSync(p)) {
    const d = JSON.parse(readFileSync(p, 'utf8'));
    chunkerNames = d.names || {};
    chunkerFlatten = d.flatten || {};
  }
} catch (e) { /* ignore */ }

// ── Load EasyEdit-Data augmentation ──
let easyEditMapping = {};
try {
  const p = resolve(__dirname, '..', 'data', 'bedrock-to-java.json');
  if (existsSync(p)) {
    easyEditMapping = JSON.parse(readFileSync(p, 'utf8'));
  }
} catch (e) { /* ignore */ }

// ── Constants ──
const FLIP_DIR = { north: 'south', south: 'north', east: 'west', west: 'east' };
const TRAPDOOR_DIR = ['east', 'west', 'south', 'north'];
const RAIL_SHAPE = {
  0: 'north_south', 1: 'east_west', 2: 'ascending_east',
  3: 'ascending_west', 4: 'ascending_north', 5: 'ascending_south'
};

/**
 * Map a Bedrock block name + properties to Java-compatible format.
 * @param {string} bedrockName - e.g. "minecraft:concrete"
 * @param {object} bedrockProps - e.g. { "color": "gray" }
 * @returns {{ name: string, properties: object }}
 */
export function mapBlock(bedrockName, bedrockProps = {}) {
  const props = { ...bedrockProps };

  // ── Step 1: Normalize namespaced property keys ──
  const nsKeys = {
    'minecraft:cardinal_direction': 'cardinal_direction',
    'minecraft:facing_direction': 'mc_facing_direction',
    'minecraft:vertical_half': 'vertical_half',
    'minecraft:block_face': 'block_face',
  };
  for (const [ns, local] of Object.entries(nsKeys)) {
    if (props[ns] !== undefined) { props[local] = props[ns]; delete props[ns]; }
  }

  // ── Step 2: Resolve Java name via Chunker mappings ──
  let javaName = bedrockName;

  // 2a. Check flatten (conditional) mappings first
  const flattenRules = chunkerFlatten[bedrockName];
  if (flattenRules) {
    for (const [stateKey, valueMap] of Object.entries(flattenRules)) {
      const propVal = props[stateKey];
      if (propVal !== undefined) {
        const resolved = valueMap[String(propVal)];
        if (resolved) {
          javaName = resolved;
          delete props[stateKey]; // consumed by name resolution
          break;
        }
      }
    }
  }

  // 2b. If not resolved by flatten, try simple name lookup
  if (javaName === bedrockName && chunkerNames[bedrockName]) {
    javaName = chunkerNames[bedrockName];
  }

  // Short name for property logic
  const shortName = javaName.replace('minecraft:', '');

  // ── Step 3: Convert Bedrock properties to Java properties ──

  // facing_direction (int 0-5) → facing
  if (props.facing_direction !== undefined) {
    const fMap = ['down', 'up', 'north', 'south', 'west', 'east'];
    props.facing = typeof props.facing_direction === 'number'
      ? fMap[Math.min(5, Math.max(0, props.facing_direction))]
      : String(props.facing_direction);
    delete props.facing_direction;
  }

  // minecraft:facing_direction (string) → facing
  if (props.mc_facing_direction !== undefined) {
    props.facing = String(props.mc_facing_direction);
    delete props.mc_facing_direction;
  }

  // cardinal_direction → facing
  if (props.cardinal_direction !== undefined) {
    props.facing = String(props.cardinal_direction);
    delete props.cardinal_direction;
  }

  // pillar_axis → axis
  if (props.pillar_axis !== undefined) {
    props.axis = props.pillar_axis; delete props.pillar_axis;
  }

  // vertical_half → type (slabs)
  if (props.vertical_half !== undefined) {
    props.type = props.vertical_half === 'top' ? 'top' : 'bottom';
    delete props.vertical_half;
  }

  // ── Step 4: Block-specific property conversions ──

  // Redstone torch: wall vs standing, direction INVERTED
  if (shortName === 'redstone_wall_torch' || shortName === 'redstone_torch') {
    const torchDir = props.torch_facing_direction;
    delete props.torch_facing_direction;
    const isLit = !bedrockName.includes('unlit');

    if (torchDir && torchDir !== 'top' && torchDir !== 'unknown') {
      javaName = 'minecraft:redstone_wall_torch';
      props.facing = FLIP_DIR[torchDir] || torchDir;
    } else {
      javaName = 'minecraft:redstone_torch';
    }
    props.lit = isLit ? 'true' : 'false';
  }

  // Regular torch: wall vs standing
  if (shortName === 'wall_torch' || shortName === 'torch') {
    const torchDir = props.torch_facing_direction;
    delete props.torch_facing_direction;

    if (torchDir && torchDir !== 'top' && torchDir !== 'unknown') {
      javaName = 'minecraft:wall_torch';
      props.facing = FLIP_DIR[torchDir] || torchDir;
    } else {
      javaName = 'minecraft:torch';
    }
  }

  // Soul torch: wall vs standing
  if (shortName === 'soul_wall_torch' || shortName === 'soul_torch') {
    const torchDir = props.torch_facing_direction;
    delete props.torch_facing_direction;

    if (torchDir && torchDir !== 'top' && torchDir !== 'unknown') {
      javaName = 'minecraft:soul_wall_torch';
      props.facing = FLIP_DIR[torchDir] || torchDir;
    } else {
      javaName = 'minecraft:soul_torch';
    }
  }

  // Piston head
  if (shortName === 'piston_head') {
    if (bedrockName.includes('sticky')) props.type = 'sticky';
    else if (!props.type) props.type = 'normal';
    if (!props.short) props.short = 'false';
  }

  // Piston / Sticky Piston
  if (shortName === 'piston' || shortName === 'sticky_piston') {
    if (props.extended === undefined) props.extended = 'false';
  }

  // Comparator
  if (shortName === 'comparator') {
    if (props.output_subtract_bit !== undefined) {
      props.mode = (props.output_subtract_bit == 1) ? 'subtract' : 'compare';
      delete props.output_subtract_bit;
    } else if (!props.mode) props.mode = 'compare';
    if (props.output_lit_bit !== undefined) {
      props.powered = (props.output_lit_bit == 1) ? 'true' : 'false';
      delete props.output_lit_bit;
    } else {
      props.powered = (bedrockName === 'minecraft:powered_comparator') ? 'true' : 'false';
    }
  }

  // Repeater
  if (shortName === 'repeater') {
    props.powered = (bedrockName === 'minecraft:powered_repeater') ? 'true' : 'false';
    if (props.repeater_delay !== undefined) {
      props.delay = String(Number(props.repeater_delay) + 1);
      delete props.repeater_delay;
    } else if (!props.delay) props.delay = '1';
    if (!props.locked) props.locked = 'false';
  }

  // Observer
  if (shortName === 'observer') {
    if (props.powered_bit !== undefined) {
      props.powered = (props.powered_bit == 1) ? 'true' : 'false';
      delete props.powered_bit;
    } else if (props.powered === undefined) props.powered = 'false';
  }

  // Button
  if (shortName.includes('button')) {
    if (props.button_pressed_bit !== undefined) {
      props.powered = (props.button_pressed_bit == 1) ? 'true' : 'false';
      delete props.button_pressed_bit;
    }
    if (props.facing) {
      const f = props.facing;
      if (f === 'down') { props.face = 'ceiling'; props.facing = 'north'; }
      else if (f === 'up') { props.face = 'floor'; props.facing = 'north'; }
      else props.face = 'wall';
    }
  }

  // Barrel
  if (shortName === 'barrel') {
    if (props.open_bit !== undefined) {
      props.open = (props.open_bit == 1) ? 'true' : 'false';
      delete props.open_bit;
    } else if (!props.open) props.open = 'false';
  }

  // Dropper / Dispenser
  if (shortName === 'dropper' || shortName === 'dispenser') {
    if (props.triggered_bit !== undefined) {
      props.triggered = (props.triggered_bit == 1) ? 'true' : 'false';
      delete props.triggered_bit;
    }
  }

  // Hopper
  if (shortName === 'hopper') {
    if (props.toggle_bit !== undefined) {
      props.enabled = (props.toggle_bit == 0) ? 'true' : 'false';
      delete props.toggle_bit;
    }
  }

  // Trapdoor
  if (shortName.includes('trapdoor')) {
    if (props.direction !== undefined) {
      props.facing = TRAPDOOR_DIR[props.direction] || 'north';
      delete props.direction;
    }
    if (props.upside_down_bit !== undefined) {
      props.half = (props.upside_down_bit == 1) ? 'top' : 'bottom';
      delete props.upside_down_bit;
    }
    if (props.open_bit !== undefined) {
      props.open = (props.open_bit == 1) ? 'true' : 'false';
      delete props.open_bit;
    }
    if (!props.open) props.open = 'false';
    if (!props.half) props.half = 'bottom';
    if (!props.waterlogged) props.waterlogged = 'false';
    if (props.powered === undefined) props.powered = 'false';
  }

  // Powered rail / activator rail / detector rail
  if (shortName === 'powered_rail' || shortName === 'activator_rail' || shortName === 'detector_rail') {
    if (props.rail_direction !== undefined) {
      props.shape = RAIL_SHAPE[props.rail_direction] || 'north_south';
      delete props.rail_direction;
    }
    if (props.rail_data_bit !== undefined) {
      props.powered = (props.rail_data_bit == 1) ? 'true' : 'false';
      delete props.rail_data_bit;
    }
    if (props.powered === undefined) props.powered = 'false';
    if (!props.waterlogged) props.waterlogged = 'false';
  }

  // Lectern
  if (shortName === 'lectern') {
    if (props.powered_bit !== undefined) {
      props.has_book = (props.powered_bit == 1) ? 'true' : 'false';
      delete props.powered_bit;
    }
    if (props.powered === undefined) props.powered = 'false';
    if (!props.has_book) props.has_book = 'false';
  }

  // Redstone wire: don't force connections
  if (shortName === 'redstone_wire') {
    if (props.redstone_signal !== undefined) {
      props.power = String(props.redstone_signal);
      delete props.redstone_signal;
    }
  }

  // ── Step 5: EasyEdit-Data augmentation ──
  const eeMap = easyEditMapping[javaName];
  if (eeMap) {
    if (eeMap.renames) {
      for (const [oldK, newK] of Object.entries(eeMap.renames)) {
        if (props[oldK] !== undefined) { props[newK] = String(props[oldK]); delete props[oldK]; }
      }
    }
    if (eeMap.defaults) {
      for (const [k, v] of Object.entries(eeMap.defaults)) {
        if (props[k] === undefined) props[k] = String(v);
      }
    }
  }

  // ── Step 6: Final cleanup ──
  const stringProps = {};
  for (const [k, v] of Object.entries(props)) {
    if (k.includes('update') || k === 'age_bit' || k === 'age') continue;
    if (k.startsWith('minecraft:')) continue;
    stringProps[k] = typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v);
  }

  return { name: javaName, properties: stringProps };
}
