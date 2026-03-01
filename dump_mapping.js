import nbt from 'prismarine-nbt';
import fs from 'fs';
import { mapBlock } from './src/block-mapping.js';

const data = fs.readFileSync('c:/Users/TN256/Documents/mcworld_render/elevator.mcstructure');
const parsed = await nbt.parse(data);
const root = parsed.parsed.value;
const palette = root.structure.value.palette.value.default.value.block_palette.value.value;

const targets = ['repeater','comparator','observer','redstone_wire','slab','piston','torch','button','redstone_block','unlit'];
const results = [];
const seen = new Set();

for (const entry of palette) {
  const name = entry.name?.value || '';
  if (!targets.some(t => name.includes(t))) continue;
  const statesObj = entry.states?.value || {};
  const bedrockProps = {};
  for (const [k, v] of Object.entries(statesObj)) {
    bedrockProps[k] = (typeof v === 'object' && v !== null && 'value' in v) ? v.value : v;
  }
  const key = name + '|' + JSON.stringify(bedrockProps);
  if (seen.has(key)) continue;
  seen.add(key);
  const javaResult = mapBlock(name, bedrockProps);
  results.push({ bedrock: { name, props: bedrockProps }, java: javaResult });
}

fs.writeFileSync('dump_result.json', JSON.stringify(results, null, 2), 'utf8');
console.log('Written ' + results.length + ' entries');
