export namespace database {
	
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

}

