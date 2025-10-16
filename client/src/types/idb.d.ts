declare module 'idb' {
  export function openDB<T = any>(name: string, version: number, opts?: any): Promise<any>;
  export type DBSchema = any;
  export type IDBPDatabase<T = any> = any;
}
