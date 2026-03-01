/**
 * bedrock-converter/src/block-mapping.js
 * 
 * Maps Bedrock block names and properties (states) to Java-compatible
 * block names and properties (for Structure NBT).
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load EasyEdit-Data mapping statically
let easyEditMapping = {};
try {
  const mappingPath = resolve(__dirname, '..', 'data', 'bedrock-to-java.json');
  if (existsSync(mappingPath)) {
    easyEditMapping = JSON.parse(readFileSync(mappingPath, 'utf8'));
  }
} catch (e) {
  // Silently continue without EasyEdit data
}

const COLORS = [
  'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime',
  'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue',
  'brown', 'green', 'red', 'black'
];

const WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'pale_oak'];

/**
 * Map a Bedrock block name + properties to Java-compatible format.
 * @param {string} bedrockName - e.g. "minecraft:concrete"
 * @param {object} bedrockProps - e.g. { "color": "gray" }
 * @returns {{ name: string, properties: object }}
 */
export function mapBlock(bedrockName, bedrockProps = {}) {
  let name = bedrockName.replace('minecraft:', '');
  const props = { ...bedrockProps };

  // 1. Flatten colors
  if (props.color && COLORS.includes(props.color)) {
    if (['concrete', 'wool', 'carpet', 'shulker_box', 'bed', 'stained_glass', 'stained_glass_pane', 'terracotta', 'glazed_terracotta'].includes(name)) {
      name = `${props.color}_${name}`;
      delete props.color;
    }
  }

  // 2. Flatten wood types
  if (['planks', 'leaves', 'sapling', 'log', 'wood', 'sign', 'fence', 'fence_gate', 'door', 'trapdoor', 'pressure_plate', 'button'].includes(name)) {
    const woodProp = props.wood_type || props.old_log_type || props.new_log_type;
    if (woodProp && WOODS.includes(woodProp)) {
      name = `${woodProp}_${name}`;
      delete props.wood_type;
      delete props.old_log_type;
      delete props.new_log_type;
    }
  }

  // 3. Handle double slabs
  if (name.includes('double_slab') || name === 'double_stone_block_slab') {
    name = name.replace('double_', '');
    props.type = 'double';
  }

  // 4. Handle dirt types
  if (name === 'dirt' && props.dirt_type) {
    if (props.dirt_type === 'coarse') name = 'coarse_dirt';
    delete props.dirt_type;
  }

  // 5. Handle stone types
  if (name === 'stone' && props.stone_type) {
    if (props.stone_type !== 'stone') name = props.stone_type;
    delete props.stone_type;
  }

  // 6. Handle facing / orientation
  if (props.facing_direction !== undefined) {
    const facingMap = ['down', 'up', 'north', 'south', 'west', 'east'];
    if (typeof props.facing_direction === 'number') {
      props.facing = facingMap[Math.min(5, Math.max(0, props.facing_direction))];
    } else {
      props.facing = props.facing_direction;
    }
    delete props.facing_direction;
  }

  if (props.pillar_axis !== undefined) {
    props.axis = props.pillar_axis;
    delete props.pillar_axis;
  }

  // Direct name changes
  const directNameChanges = {
    'grass': 'grass_block',
    'tallgrass': 'grass',
    'waterlily': 'lily_pad',
    'reeds': 'sugar_cane',
    'lit_pumpkin': 'jack_o_lantern',
    'unpowered_repeater': 'repeater',
    'powered_repeater': 'repeater',
    'unpowered_comparator': 'comparator',
    'powered_comparator': 'comparator',
    'lit_redstone_ore': 'redstone_ore',
    'lit_redstone_lamp': 'redstone_lamp'
  };

  if (directNameChanges[name]) {
    name = directNameChanges[name];
  }

  const javaName = 'minecraft:' + name;

  // EasyEdit-Data augmentation
  const eeMap = easyEditMapping[javaName];
  if (eeMap) {
    if (eeMap.renames) {
      for (const [oldKey, newKey] of Object.entries(eeMap.renames)) {
        if (props[oldKey] !== undefined) {
          props[newKey] = String(props[oldKey]);
          delete props[oldKey];
        }
      }
    }
    if (eeMap.defaults) {
      for (const [key, val] of Object.entries(eeMap.defaults)) {
        if (props[key] === undefined) {
          props[key] = String(val);
        }
      }
    }
  }

  // Specific Java fixes
  if (javaName === 'minecraft:repeater') {
    if (bedrockName.includes('powered')) props.powered = 'true';
    if (props.repeater_delay !== undefined) {
      props.delay = String(props.repeater_delay + 1);
      delete props.repeater_delay;
    }
  }

  // Ensure all properties are strings
  const stringProps = {};
  for (const [k, v] of Object.entries(props)) {
    if (k.includes('bit') || k.includes('update')) continue;
    if (typeof v === 'boolean') {
      stringProps[k] = v ? 'true' : 'false';
    } else if (typeof v === 'number' && (v === 0 || v === 1) && (k === 'powered' || k === 'open' || k === 'waterlogged')) {
      stringProps[k] = v === 1 ? 'true' : 'false';
    } else {
      stringProps[k] = String(v);
    }
  }

  return { name: javaName, properties: stringProps };
}
