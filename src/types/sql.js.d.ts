declare module 'sql.js' {
  interface Database {
    run(sql: string, params?: any[]): void;
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  interface Statement {
    bind(params?: any[]): boolean;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  }

  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
  }

  export type { Database, Statement, SqlJsStatic };
  export default function initSqlJs(): Promise<SqlJsStatic>;
}
