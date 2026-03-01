// bedrock-nbt-converter/src/post-process.js

const DIR_OFFSETS = {
  'down':  [0, -1, 0],
  'up':    [0, 1, 0],
  'north': [0, 0, -1],
  'south': [0, 0, 1],
  'west':  [-1, 0, 0],
  'east':  [1, 0, 0]
};

const REDSTONE_CONNECTABLES = new Set([
  'minecraft:redstone_wire', 'minecraft:repeater', 'minecraft:comparator',
  'minecraft:redstone_torch', 'minecraft:redstone_wall_torch',
  'minecraft:redstone_block', 'minecraft:observer', 'minecraft:lever',
  'minecraft:stone_button', 'minecraft:oak_button', 'minecraft:daylight_detector',
  'minecraft:piston', 'minecraft:sticky_piston', 'minecraft:dispenser',
  'minecraft:dropper', 'minecraft:hopper', 'minecraft:note_block',
  'minecraft:redstone_lamp', 'minecraft:target', 'minecraft:tripwire_hook'
]);

function isRedstoneConnectable(name) {
  if (REDSTONE_CONNECTABLES.has(name)) return true;
  if (name.includes('button') || name.includes('pressure_plate') || name.includes('trapdoor') || name.includes('door') || name.includes('rail')) return true;
  return false;
}

export function postProcessBlocks(blocks, palette) {
  const posMap = new Map();
  for (let i = 0; i < blocks.length; i++) {
    const [x, y, z] = blocks[i].pos;
    posMap.set(`${x},${y},${z}`, i);
  }

  const modifiedPalette = [...palette];
  const paletteMap = new Map();
  for (let i = 0; i < modifiedPalette.length; i++) {
    const e = modifiedPalette[i];
    const props = e.Properties || {};
    const propStr = Object.entries(props).sort((a,b) => a[0].localeCompare(b[0])).map(([k,v]) => `${k}=${v}`).join(',');
    paletteMap.set(`${e.Name}|${propStr}`, i);
  }

  const getOrCreatePalette = (name, props) => {
    const propStr = Object.entries(props).sort((a,b) => a[0].localeCompare(b[0])).map(([k,v]) => `${k}=${v}`).join(',');
    const key = `${name}|${propStr}`;
    let idx = paletteMap.get(key);
    if (idx === undefined) {
      idx = modifiedPalette.length;
      modifiedPalette.push({ Name: name, Properties: { ...props } });
      paletteMap.set(key, idx);
    }
    return idx;
  };

  const modifiedBlocks = [...blocks];

  const getBlockNameAt = (x, y, z) => {
    const idx = posMap.get(`${x},${y},${z}`);
    if (idx === undefined) return null;
    return modifiedPalette[modifiedBlocks[idx].state]?.Name;
  };

  for (let i = 0; i < blocks.length; i++) {
    const stateIdx = blocks[i].state;
    const entry = modifiedPalette[stateIdx];
    const name = entry.Name;
    const [hx, hy, hz] = blocks[i].pos;

    // --- PISTON HEAD PROCESSING ---
    if (name === 'minecraft:piston_head') {
      const facing = entry.Properties?.facing;
      if (facing && DIR_OFFSETS[facing]) {
        const off = DIR_OFFSETS[facing];
        const baseX = hx - off[0], baseY = hy - off[1], baseZ = hz - off[2];
        const baseBlockIdx = posMap.get(`${baseX},${baseY},${baseZ}`);
        if (baseBlockIdx !== undefined) {
          const baseEntry = modifiedPalette[modifiedBlocks[baseBlockIdx].state];
          if (baseEntry.Name === 'minecraft:piston' || baseEntry.Name === 'minecraft:sticky_piston') {
            const extProps = { ...(baseEntry.Properties || {}), extended: 'true' };
            modifiedBlocks[baseBlockIdx].state = getOrCreatePalette(baseEntry.Name, extProps);
          }
        }
      }
    }

    // --- REDSTONE WIRE PROCESSING ---
    if (name === 'minecraft:redstone_wire') {
      const origProps = entry.Properties || {};
      const newProps = { ...origProps };

      const checkDir = (dx, dz) => {
        const sideName = getBlockNameAt(hx + dx, hy, hz + dz);
        if (sideName && isRedstoneConnectable(sideName)) return 'side';
        if (sideName === 'minecraft:redstone_wire') return 'side';

        const upName = getBlockNameAt(hx + dx, hy + 1, hz + dz);
        if (upName === 'minecraft:redstone_wire') return 'up';

        const downName = getBlockNameAt(hx + dx, hy - 1, hz + dz);
        if (downName === 'minecraft:redstone_wire') return 'side';

        return 'none';
      };

      const north = checkDir(0, -1);
      const south = checkDir(0, 1);
      const east = checkDir(1, 0);
      const west = checkDir(-1, 0);

      newProps.north = north;
      newProps.south = south;
      newProps.east = east;
      newProps.west = west;
      
      // If no connections, it defaults to a dot (all none), so if we want it to look connected when solitary:
      // Actually deepslate handles the rendering of crossed wires properly if we provide none, but if all are none it's a dot.
      // Bedrock connects to blocks even if we don't know they are redstone (e.g. solid blocks). But we'll use this heuristic.

      modifiedBlocks[i].state = getOrCreatePalette(name, newProps);
    }
  }

  return { blocks: modifiedBlocks, palette: modifiedPalette };
}
