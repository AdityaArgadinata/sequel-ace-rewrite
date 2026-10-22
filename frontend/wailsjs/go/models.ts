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

	export class BrowseRequest {
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
	    generated: boolean;
	    nullable: boolean;

	    static createFrom(source: any = {}) {
	        return new EditableColumn(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.type = source["type"];
	        this.primary = source["primary"];
	        this.generated = source["generated"];
	        this.nullable = source["nullable"];
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
	    durationMS: number;

	    static createFrom(source: any = {}) {
	        return new Result(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.columns = this.convertValues(source["columns"], Column);
	        this.rows = this.convertValues(source["rows"], Cell);
	        this.truncated = source["truncated"];
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
	export class TableDetails {
	    columns: EditableColumn[];
	    editable: boolean;
	    reason: string;

	    static createFrom(source: any = {}) {
	        return new TableDetails(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
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
	    }
	}

}

export namespace profiles {

	export class Profile {
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

export namespace tunnel {

	export class Settings {
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
	        this.host = source["host"];
	        this.port = source["port"];
	        this.user = source["user"];
	        this.keyFile = source["keyFile"];
	        this.knownHosts = source["knownHosts"];
	    }
	}
	export class Options {
	    settings: Settings;
	    password: string;
	    keyPassphrase: string;

	    static createFrom(source: any = {}) {
	        return new Options(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
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
