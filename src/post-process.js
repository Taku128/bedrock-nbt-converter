/**
 * bedrock-nbt-converter/src/post-process.js
 * 
 * Post-processing pass on converted blocks to fix inter-block dependencies
 * that can't be resolved during single-block mapping.
 */

// Direction offsets: facing → [dx, dy, dz]
const DIR_OFFSETS = {
  'down':  [0, -1, 0],
  'up':    [0, 1, 0],
  'north': [0, 0, -1],
  'south': [0, 0, 1],
  'west':  [-1, 0, 0],
  'east':  [1, 0, 0]
};

/**
 * Post-process blocks to fix piston extended state.
 * When a piston_head exists in the structure, the adjacent piston/sticky_piston
 * in the opposite direction should have extended=true.
 * 
 * @param {Array<{pos: number[], state: number}>} blocks
 * @param {Array<{Name: string, Properties?: object}>} palette
 * @returns {{blocks: Array, palette: Array}} Modified blocks and palette
 */
export function postProcessBlocks(blocks, palette) {
  // Build position → block index map
  const posMap = new Map();
  for (let i = 0; i < blocks.length; i++) {
    const [x, y, z] = blocks[i].pos;
    posMap.set(`${x},${y},${z}`, i);
  }

  // Find all piston_head blocks and their facing direction
  const pistonHeads = [];
  for (let i = 0; i < blocks.length; i++) {
    const entry = palette[blocks[i].state];
    if (entry.Name === 'minecraft:piston_head') {
      const facing = entry.Properties?.facing;
      if (facing && DIR_OFFSETS[facing]) {
        pistonHeads.push({ blockIdx: i, facing });
      }
    }
  }

  if (pistonHeads.length === 0) return { blocks, palette };

  // For each piston_head, check the block BEHIND it (opposite of facing)
  // That block should be a piston/sticky_piston with extended=true
  const modifiedPalette = [...palette];
  const paletteMap = new Map();
  for (let i = 0; i < modifiedPalette.length; i++) {
    const e = modifiedPalette[i];
    const propStr = e.Properties ? Object.entries(e.Properties).sort((a,b) => a[0].localeCompare(b[0])).map(([k,v]) => `${k}=${v}`).join(',') : '';
    paletteMap.set(`${e.Name}|${propStr}`, i);
  }

  const modifiedBlocks = [...blocks];

  for (const { blockIdx, facing } of pistonHeads) {
    const [hx, hy, hz] = blocks[blockIdx].pos;
    const off = DIR_OFFSETS[facing];
    // The piston base is BEHIND the head (opposite direction of facing)
    const baseX = hx - off[0];
    const baseY = hy - off[1];
    const baseZ = hz - off[2];
    
    const baseKey = `${baseX},${baseY},${baseZ}`;
    const baseBlockIdx = posMap.get(baseKey);
    if (baseBlockIdx === undefined) continue;

    const baseEntry = modifiedPalette[modifiedBlocks[baseBlockIdx].state];
    if (baseEntry.Name !== 'minecraft:piston' && baseEntry.Name !== 'minecraft:sticky_piston') continue;

    // Create extended variant of this piston palette entry
    const extProps = { ...(baseEntry.Properties || {}), extended: 'true' };
    const extPropStr = Object.entries(extProps).sort((a,b) => a[0].localeCompare(b[0])).map(([k,v]) => `${k}=${v}`).join(',');
    const extKey = `${baseEntry.Name}|${extPropStr}`;

    let extIdx = paletteMap.get(extKey);
    if (extIdx === undefined) {
      extIdx = modifiedPalette.length;
      modifiedPalette.push({ Name: baseEntry.Name, Properties: extProps });
      paletteMap.set(extKey, extIdx);
    }

    modifiedBlocks[baseBlockIdx] = { ...modifiedBlocks[baseBlockIdx], state: extIdx };
  }

  return { blocks: modifiedBlocks, palette: modifiedPalette };
}
