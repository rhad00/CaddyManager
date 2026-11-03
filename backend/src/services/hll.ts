/**
 * A small HyperLogLog (precision 12, about 1.6% error) for counting distinct visitors.
 * Sketches merge by taking the larger register, so the visitors of several hosts or buckets can be
 * unioned, which a count per host cannot do, and memory stays 4 KB however many visitors there are.
 */
const PRECISION = 12;
const REGISTERS = 1 << PRECISION;
const ALPHA = 0.7213 / (1 + 1.079 / REGISTERS);

/** MurmurHash3 (32-bit) of a string */
function murmur3(text: string): number {
  let h = 0x9747b28c;
  const len = text.length;
  let i = 0;
  for (; i + 4 <= len; i += 4) {
    let k = (text.charCodeAt(i) & 0xff) | ((text.charCodeAt(i + 1) & 0xff) << 8) | ((text.charCodeAt(i + 2) & 0xff) << 16) | ((text.charCodeAt(i + 3) & 0xff) << 24);
    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  let k = 0;
  switch (len & 3) {
    case 3: k ^= (text.charCodeAt(i + 2) & 0xff) << 16; // falls through
    case 2: k ^= (text.charCodeAt(i + 1) & 0xff) << 8; // falls through
    case 1:
      k ^= text.charCodeAt(i) & 0xff;
      k = Math.imul(k, 0xcc9e2d51);
      k = (k << 15) | (k >>> 17);
      k = Math.imul(k, 0x1b873593);
      h ^= k;
      break;
    default:
  }
  h ^= len;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export class HyperLogLog {
  private readonly registers = new Uint8Array(REGISTERS);

  add(value: string): void {
    const hash = murmur3(value);
    const index = hash >>> (32 - PRECISION);
    // Position of the first 1 bit in the remaining 20 bits, counted from 1
    const rest = (hash << PRECISION) >>> 0;
    const rank = rest === 0 ? 32 - PRECISION + 1 : Math.clz32(rest) + 1;
    if (rank > this.registers[index]) this.registers[index] = rank;
  }

  merge(other: HyperLogLog): void {
    for (let i = 0; i < REGISTERS; i++) {
      if (other.registers[i] > this.registers[i]) this.registers[i] = other.registers[i];
    }
  }

  count(): number {
    let sum = 0;
    let zeros = 0;
    for (let i = 0; i < REGISTERS; i++) {
      sum += 2 ** -this.registers[i];
      if (this.registers[i] === 0) zeros += 1;
    }
    const estimate = (ALPHA * REGISTERS * REGISTERS) / sum;
    // Small counts: counting the empty registers is exact enough and much better than the raw estimate
    if (estimate <= 2.5 * REGISTERS && zeros > 0) return Math.round(REGISTERS * Math.log(REGISTERS / zeros));
    return Math.round(estimate);
  }
}
