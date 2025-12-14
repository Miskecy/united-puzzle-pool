/**
 * Formata um range hexadecimal removendo zeros à esquerda
 * Exemplo: 0x0000000000000000000000000000000000000000000000000000005095271276 → 0x5095271276
 */
export function formatCompactHexRange(hexValue: string): string {
  // Remove o prefixo 0x se existir
  const cleanHex = hexValue.replace(/^0x/, '');
  
  // Remove zeros à esquerda
  const trimmedHex = cleanHex.replace(/^0+/, '');
  
  // Se ficar vazio (todos zeros), retorna "0x0"
  if (trimmedHex === '') {
    return '0x0';
  }
  
  // Adiciona o prefixo 0x e retorna
  return `0x${trimmedHex}`;
}

/**
 * Formata um range completo (start:end) de forma compacta
 * Exemplo: 400000000000000000:7fffffffffffffffff → 0x400000000000000000:0x7fffffffffffffffff
 */
export function formatCompactRange(startRange: string, endRange: string): string {
  const formattedStart = formatCompactHexRange(startRange);
  const formattedEnd = formatCompactHexRange(endRange);
  return `${formattedStart}:${formattedEnd}`;
}

/**
 * Valida se um endereço Bitcoin é válido (formato básico)
 */
export function isValidBitcoinAddress(address: string): boolean {
  const s = (address || '').trim();
  if (!s) return false;

  // Legacy Base58 (P2PKH/P2SH): starts with 1 or 3, typical length 26–35
  const base58Reg = /^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/;
  if (base58Reg.test(s)) return true;

  // Bech32 (SegWit/Taproot): bc1q... (P2WPKH/P2WSH) or bc1p... (Taproot)
  // BIP-0173 charset for data part: qpzry9x8gf2tvdw0s3jn54khce6mua7l
  // Length can vary; allow 14–90 to be safe and require at least 6-char data part
  const lower = s.toLowerCase();
  const bech32Reg = /^bc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{6,87}$/;
  if (bech32Reg.test(lower)) return true;

  return false;
}
