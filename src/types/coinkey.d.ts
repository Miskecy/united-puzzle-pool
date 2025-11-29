declare module 'coinkey' {
  export default class CoinKey {
    constructor(privateKey: Buffer, network?: { private?: number; public?: number });
    publicAddress: string;
  }
}