export namespace authproviders {

	export class SASettings {
	    provider?: string;
	    region?: string;
	    awsProfile?: string;
	    vaultAddress?: string;
	    vaultMount?: string;
	    vaultRole?: string;
	    vaultNamespace?: string;

	    static createFrom(source: any = {}) {
	        return new SASettings(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.provider = source["provider"];
	        this.region = source["region"];
	        this.awsProfile = source["awsProfile"];
	        this.vaultAddress = source["vaultAddress"];
	        this.vaultMount = source["vaultMount"];
	        this.vaultRole = source["vaultRole"];
	        this.vaultNamespace = source["vaultNamespace"];
	    }
	}
	export class SAOptions {
	    settings: SASettings;
	    vaultToken?: string;

	    static createFrom(source: any = {}) {
	        return new SAOptions(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.settings = this.convertValues(source["settings"], SASettings);
	        this.vaultToken = source["vaultToken"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace credentials {

	export class Secrets {
	    password: string;
	    sshPassword: string;
	    keyPassphrase: string;

	    static createFrom(source: any = {}) {
	        return new Secrets(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.password = source["password"];
	        this.sshPassword = source["sshPassword"];
	        this.keyPassphrase = source["keyPassphrase"];
	    }
	}

}

export namespace database {

	export class SAFilterRule {
	    column: string;
	    operator: string;
	    value: string;

	    static createFrom(source: any = {}) {
	        return new SAFilterRule(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.column = source["column"];
	        this.operator = source["operator"];
	        this.value = source["value"];
	    }
	}
	export class BrowseRequest {
	    filters: SAFilterRule[];
	    match: string;
	    database: string;
	    table: string;
	    offset: number;
	    limit: number;
	    sort: string;
	    descending: boolean;
	    column: string;
	    operator: string;
	    value: string;

	    static createFrom(source: any = {}) {
	        return new BrowseRequest(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.filters = this.convertValues(source["filters"], SAFilterRule);
	        this.match = source["match"];
	        this.database = source["database"];
	        this.table = source["table"];
	        this.offset = source["offset"];
	        this.limit = source["limit"];
	        this.sort = source["sort"];
	        this.descending = source["descending"];
	        this.column = source["column"];
	        this.operator = source["operator"];
	        this.value = source["value"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Cell {
	    value: string;
	    null: boolean;
	    binary: boolean;

	    static createFrom(source: any = {}) {
	        return new Cell(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.value = source["value"];
	        this.null = source["null"];
	        this.binary = source["binary"];
	    }
	}
	export class Column {
	    name: string;
	    type: string;

	    static createFrom(source: any = {}) {
	        return new Column(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.type = source["type"];
	    }
	}
	export class Connection {
	    auth?: authproviders.SAOptions;
	    socket?: string;
	    timeZone?: string;
	    host: string;
	    port: number;
	    user: string;
	    password: string;
	    tls: boolean;
	    caPEM: string;
	    ssh?: tunnel.Options;

	    static createFrom(source: any = {}) {
	        return new Connection(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.auth = this.convertValues(source["auth"], authproviders.SAOptions);
	        this.socket = source["socket"];
	        this.timeZone = source["timeZone"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.user = source["user"];
	        this.password = source["password"];
	        this.tls = source["tls"];
	        this.caPEM = source["caPEM"];
	        this.ssh = this.convertValues(source["ssh"], tunnel.Options);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EditableColumn {
	    name: string;
	    type: string;
	    primary: boolean;
	    identity: boolean;
	    autoIncrement: boolean;
	    generated: boolean;
	    nullable: boolean;
	    defaultValue?: Cell;
	    defaultExpression: string;

	    static createFrom(source: any = {}) {
	        return new EditableColumn(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.type = source["type"];
	        this.primary = source["primary"];
	        this.identity = source["identity"];
	        this.autoIncrement = source["autoIncrement"];
	        this.generated = source["generated"];
	        this.nullable = source["nullable"];
	        this.defaultValue = this.convertValues(source["defaultValue"], Cell);
	        this.defaultExpression = source["defaultExpression"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Mutation {
	    database: string;
	    table: string;
	    action: string;
	    columns: string[];
	    original: Cell[];
	    values: Record<string, Cell>;

	    static createFrom(source: any = {}) {
	        return new Mutation(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.database = source["database"];
	        this.table = source["table"];
	        this.action = source["action"];
	        this.columns = source["columns"];
	        this.original = this.convertValues(source["original"], Cell);
	        this.values = this.convertValues(source["values"], Cell, true);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Result {
	    columns: Column[];
	    rows: Cell[][];
	    truncated: boolean;
	    sessionClosed: boolean;
	    notice?: string;
	    durationMS: number;

	    static createFrom(source: any = {}) {
	        return new Result(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.columns = this.convertValues(source["columns"], Column);
	        this.rows = this.convertValues(source["rows"], Cell);
	        this.truncated = source["truncated"];
	        this.sessionClosed = source["sessionClosed"];
	        this.notice = source["notice"];
	        this.durationMS = source["durationMS"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SAActivity {
	    time: string;
	    operation: string;
	    durationMS: number;
	    success: boolean;

	    static createFrom(source: any = {}) {
	        return new SAActivity(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.time = source["time"];
	        this.operation = source["operation"];
	        this.durationMS = source["durationMS"];
	        this.success = source["success"];
	    }
	}
	export class SAAdminRequest {
	    kind: string;
	    action: string;
	    database: string;
	    table: string;
	    name: string;
	    timing: string;
	    event: string;
	    body: string;
	    engine: string;
	    collation: string;
	    comment: string;
	    user: string;
	    host: string;
	    password: string;
	    privileges: string[];
	    scope: string;
	    columns: string[];
	    grantOption: boolean;
	    newUser: string;
	    newHost: string;
	    role: string;
	    roleHost: string;

	    static createFrom(source: any = {}) {
	        return new SAAdminRequest(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.action = source["action"];
	        this.database = source["database"];
	        this.table = source["table"];
	        this.name = source["name"];
	        this.timing = source["timing"];
	        this.event = source["event"];
	        this.body = source["body"];
	        this.engine = source["engine"];
	        this.collation = source["collation"];
	        this.comment = source["comment"];
	        this.user = source["user"];
	        this.host = source["host"];
	        this.password = source["password"];
	        this.privileges = source["privileges"];
	        this.scope = source["scope"];
	        this.columns = source["columns"];
	        this.grantOption = source["grantOption"];
	        this.newUser = source["newUser"];
	        this.newHost = source["newHost"];
	        this.role = source["role"];
	        this.roleHost = source["roleHost"];
	    }
	}
	export class SABatchOutcome {
	    completed: number;
	    total: number;
	    error: string;
	    uncertain: boolean;
	    warnings: string;
	    statement: number;
	    line: number;

	    static createFrom(source: any = {}) {
	        return new SABatchOutcome(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.completed = source["completed"];
	        this.total = source["total"];
	        this.error = source["error"];
	        this.uncertain = source["uncertain"];
	        this.warnings = source["warnings"];
	        this.statement = source["statement"];
	        this.line = source["line"];
	    }
	}
	export class SACSVMapping {
	    source: number;
	    target: string;

	    static createFrom(source: any = {}) {
	        return new SACSVMapping(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.source = source["source"];
	        this.target = source["target"];
	    }
	}
	export class SACSVPlan {
	    token: string;
	    sql: string;
	    rows: number;

	    static createFrom(source: any = {}) {
	        return new SACSVPlan(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.token = source["token"];
	        this.sql = source["sql"];
	        this.rows = source["rows"];
	    }
	}
	export class SACSVPreview {
	    token: string;
	    headers: string[];
	    sample: string[][];
	    rows: number;
	    name: string;
	    columns: EditableColumn[];
	    cancelled: boolean;

	    static createFrom(source: any = {}) {
	        return new SACSVPreview(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.token = source["token"];
	        this.headers = source["headers"];
	        this.sample = source["sample"];
	        this.rows = source["rows"];
	        this.name = source["name"];
	        this.columns = this.convertValues(source["columns"], EditableColumn);
	        this.cancelled = source["cancelled"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SADumpObject {
	    kind: string;
	    name: string;
	    dependencies: string[];

	    static createFrom(source: any = {}) {
	        return new SADumpObject(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.name = source["name"];
	        this.dependencies = source["dependencies"];
	    }
	}
	export class SADatabaseInventory {
	    database: string;
	    fingerprint: string;
	    objects: SADumpObject[];
	    notice: string;

	    static createFrom(source: any = {}) {
	        return new SADatabaseInventory(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.database = source["database"];
	        this.fingerprint = source["fingerprint"];
	        this.objects = this.convertValues(source["objects"], SADumpObject);
	        this.notice = source["notice"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

	export class SAExportSpec {
	    format: string;
	    scope: string;
	    browse: BrowseRequest;
	    database: string;
	    table: string;
	    includeDDL: boolean;

	    static createFrom(source: any = {}) {
	        return new SAExportSpec(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.format = source["format"];
	        this.scope = source["scope"];
	        this.browse = this.convertValues(source["browse"], BrowseRequest);
	        this.database = source["database"];
	        this.table = source["table"];
	        this.includeDDL = source["includeDDL"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

	export class SAObjectPlan {
	    token: string;
	    sql: string[];

	    static createFrom(source: any = {}) {
	        return new SAObjectPlan(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.token = source["token"];
	        this.sql = source["sql"];
	    }
	}
	export class SAObjectRequest {
	    kind: string;
	    action: string;
	    database: string;
	    table: string;
	    destination: string;
	    name: string;
	    definition: string;
	    includeData: boolean;

	    static createFrom(source: any = {}) {
	        return new SAObjectRequest(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.action = source["action"];
	        this.database = source["database"];
	        this.table = source["table"];
	        this.destination = source["destination"];
	        this.name = source["name"];
	        this.definition = source["definition"];
	        this.includeData = source["includeData"];
	    }
	}
	export class SASQLImportPreview {
	    token: string;
	    name: string;
	    statements: number;
	    preview: string;
	    cancelled: boolean;

	    static createFrom(source: any = {}) {
	        return new SASQLImportPreview(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.token = source["token"];
	        this.name = source["name"];
	        this.statements = source["statements"];
	        this.preview = source["preview"];
	        this.cancelled = source["cancelled"];
	    }
	}
	export class SASchemaChange {
	    database: string;
	    table: string;
	    action: string;
	    kind: string;
	    original: string;
	    name: string;
	    indexKind: string;
	    definition: string;
	    columnEdits?: Record<string, string>;

	    static createFrom(source: any = {}) {
	        return new SASchemaChange(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.database = source["database"];
	        this.table = source["table"];
	        this.action = source["action"];
	        this.kind = source["kind"];
	        this.original = source["original"];
	        this.name = source["name"];
	        this.indexKind = source["indexKind"];
	        this.definition = source["definition"];
	        this.columnEdits = source["columnEdits"];
	    }
	}
	export class SASchemaObject {
	    kind: string;
	    name: string;
	    indexKind: string;
	    definition: string;

	    static createFrom(source: any = {}) {
	        return new SASchemaObject(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.name = source["name"];
	        this.indexKind = source["indexKind"];
	        this.definition = source["definition"];
	    }
	}
	export class SASchemaPlan {
	    token: string;
	    sql: string;

	    static createFrom(source: any = {}) {
	        return new SASchemaPlan(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.token = source["token"];
	        this.sql = source["sql"];
	    }
	}
	export class Structure {
	    columns: Result;
	    indexes: Result;
	    foreignKeys: Result;
	    definition: Result;
	    objects: SASchemaObject[];
	    editable: boolean;
	    charsets: Result;
	    collations: Result;
	    reason: string;

	    static createFrom(source: any = {}) {
	        return new Structure(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.columns = this.convertValues(source["columns"], Result);
	        this.indexes = this.convertValues(source["indexes"], Result);
	        this.foreignKeys = this.convertValues(source["foreignKeys"], Result);
	        this.definition = this.convertValues(source["definition"], Result);
	        this.objects = this.convertValues(source["objects"], SASchemaObject);
	        this.editable = source["editable"];
	        this.charsets = this.convertValues(source["charsets"], Result);
	        this.collations = this.convertValues(source["collations"], Result);
	        this.reason = source["reason"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TableDetails {
	    engine: string;
	    columns: EditableColumn[];
	    editable: boolean;
	    reason: string;

	    static createFrom(source: any = {}) {
	        return new TableDetails(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.engine = source["engine"];
	        this.columns = this.convertValues(source["columns"], EditableColumn);
	        this.editable = source["editable"];
	        this.reason = source["reason"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace history {

	export class Entry {
	    time: string;
	    kind: string;
	    rows: number;
	    durationMS: number;
	    success: boolean;
	    sql?: string;

	    static createFrom(source: any = {}) {
	        return new Entry(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.time = source["time"];
	        this.kind = source["kind"];
	        this.rows = source["rows"];
	        this.durationMS = source["durationMS"];
	        this.success = source["success"];
	        this.sql = source["sql"];
	    }
	}

}

export namespace main {

	export class CSVExport {
	    rows: number;
	    cancelled: boolean;

	    static createFrom(source: any = {}) {
	        return new CSVExport(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.rows = source["rows"];
	        this.cancelled = source["cancelled"];
	    }
	}
	export class SACellFile {
	    value: database.Cell;
	    name: string;
	    cancelled: boolean;

	    static createFrom(source: any = {}) {
	        return new SACellFile(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.value = this.convertValues(source["value"], database.Cell);
	        this.name = source["name"];
	        this.cancelled = source["cancelled"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SAFavoritesPreview {
	    token: string;
	    candidates: nativefiles.SACandidate[];
	    cancelled: boolean;

	    static createFrom(source: any = {}) {
	        return new SAFavoritesPreview(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.token = source["token"];
	        this.candidates = this.convertValues(source["candidates"], nativefiles.SACandidate);
	        this.cancelled = source["cancelled"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SAQueryPlan {
	    statements: sqlscript.SAStatement[];
	    sqlMode: string;

	    static createFrom(source: any = {}) {
	        return new SAQueryPlan(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.statements = this.convertValues(source["statements"], sqlscript.SAStatement);
	        this.sqlMode = source["sqlMode"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SASQLFile {
	    sql: string;
	    name: string;
	    cancelled: boolean;

	    static createFrom(source: any = {}) {
	        return new SASQLFile(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sql = source["sql"];
	        this.name = source["name"];
	        this.cancelled = source["cancelled"];
	    }
	}

}

export namespace nativefiles {

	export class SACandidate {
	    profile: profiles.Profile;
	    database: string;
	    issue: string;

	    static createFrom(source: any = {}) {
	        return new SACandidate(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.profile = this.convertValues(source["profile"], profiles.Profile);
	        this.database = source["database"];
	        this.issue = source["issue"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SASession {
	    profile: profiles.Profile;
	    database: string;
	    table: string;
	    view: string;
	    sql: string;
	    notice: string;
	    cancelled: boolean;

	    static createFrom(source: any = {}) {
	        return new SASession(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.profile = this.convertValues(source["profile"], profiles.Profile);
	        this.database = source["database"];
	        this.table = source["table"];
	        this.view = source["view"];
	        this.sql = source["sql"];
	        this.notice = source["notice"];
	        this.cancelled = source["cancelled"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace profiles {

	export class FolderChange {
	    action: string;
	    folder: string;
	    destination: string;

	    static createFrom(source: any = {}) {
	        return new FolderChange(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.action = source["action"];
	        this.folder = source["folder"];
	        this.destination = source["destination"];
	    }
	}
	export class FolderOutcome {
	    completed: number;
	    total: number;
	    error: string;

	    static createFrom(source: any = {}) {
	        return new FolderOutcome(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.completed = source["completed"];
	        this.total = source["total"];
	        this.error = source["error"];
	    }
	}
	export class Profile {
	    auth?: authproviders.SASettings;
	    socket?: string;
	    timeZone?: string;
	    folder?: string;
	    color?: string;
	    initialDatabase?: string;
	    id: string;
	    name: string;
	    host: string;
	    port: number;
	    user: string;
	    tls: boolean;
	    caPEM: string;
	    ssh?: tunnel.Settings;

	    static createFrom(source: any = {}) {
	        return new Profile(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.auth = this.convertValues(source["auth"], authproviders.SASettings);
	        this.socket = source["socket"];
	        this.timeZone = source["timeZone"];
	        this.folder = source["folder"];
	        this.color = source["color"];
	        this.initialDatabase = source["initialDatabase"];
	        this.id = source["id"];
	        this.name = source["name"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.user = source["user"];
	        this.tls = source["tls"];
	        this.caPEM = source["caPEM"];
	        this.ssh = this.convertValues(source["ssh"], tunnel.Settings);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace queryfavorites {

	export class SAQueryFavorite {
	    id: string;
	    name: string;
	    sql: string;

	    static createFrom(source: any = {}) {
	        return new SAQueryFavorite(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.sql = source["sql"];
	    }
	}

}

export namespace sqlscript {

	export class SAStatement {
	    sql: string;
	    from: number;
	    to: number;
	    line: number;
	    mode: string;

	    static createFrom(source: any = {}) {
	        return new SAStatement(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sql = source["sql"];
	        this.from = source["from"];
	        this.to = source["to"];
	        this.line = source["line"];
	        this.mode = source["mode"];
	    }
	}

}

export namespace tunnel {

	export class Settings {
	    useAgent?: boolean;
	    keyboardInteractive?: boolean;
	    host: string;
	    port: number;
	    user: string;
	    keyFile: string;
	    knownHosts: string;

	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.useAgent = source["useAgent"];
	        this.keyboardInteractive = source["keyboardInteractive"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.user = source["user"];
	        this.keyFile = source["keyFile"];
	        this.knownHosts = source["knownHosts"];
	    }
	}
	export class Options {
	    challengeAnswers?: string[];
	    settings: Settings;
	    password: string;
	    keyPassphrase: string;

	    static createFrom(source: any = {}) {
	        return new Options(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.challengeAnswers = source["challengeAnswers"];
	        this.settings = this.convertValues(source["settings"], Settings);
	        this.password = source["password"];
	        this.keyPassphrase = source["keyPassphrase"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace updates {

	export class Result {
	    current: string;
	    latest: string;
	    available: boolean;
	    development: boolean;
	    url: string;
	    preview: boolean;

	    static createFrom(source: any = {}) {
	        return new Result(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.current = source["current"];
	        this.latest = source["latest"];
	        this.available = source["available"];
	        this.development = source["development"];
	        this.url = source["url"];
	        this.preview = source["preview"];
	    }
	}

}
