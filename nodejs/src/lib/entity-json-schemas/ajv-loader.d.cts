declare const ajvLoader: {
  Ajv: new (opts?: {
    allErrors?: boolean;
    strict?: boolean;
    validateFormats?: boolean;
  }) => {
    compile: (schema: object) => ((data: unknown) => boolean) & {
      errors?:
        | Array<{
            instancePath?: string;
            schemaPath?: string;
            message?: string;
            params?: Record<string, unknown>;
          }>
        | null;
    };
    addSchema: (schema: object | object[], key?: string) => unknown;
    getSchema: (keyRef: string) => unknown;
  };
  addFormats: (ajv: unknown) => void;
  packageRoot: string;
};

export = ajvLoader;
