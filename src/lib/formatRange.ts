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
  // Remove espaços em branco
  const cleanAddress = address.trim();
  
  // Verifica se tem entre 26 e 35 caracteres
  if (cleanAddress.length < 26 || cleanAddress.length > 35) {
    return false;
  }
  
  // Verifica se começa com 1, 3 ou bc1
  if (!/^[13]|^bc1/.test(cleanAddress)) {
    return false;
  }
  
  // Verifica se contém apenas caracteres válidos (base58)
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(cleanAddress)) {
    return false;
  }
  
  return true;
}