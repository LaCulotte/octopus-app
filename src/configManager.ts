import fs from "fs"

export class ConfigManager {
    configPath: string;
    configSchemaPath: string;

    constructor(configPath: string, configSchemaPath: string) {
        this.configPath = configPath;
        this.configSchemaPath = configSchemaPath;
    }

    getConfigSchemaSync() {
        return JSON.parse(fs.readFileSync(this.configSchemaPath, 'utf8'));
    }

    getConfig() {
        return new Promise((resolve, reject) => {
            fs.readFile(this.configPath, 'utf8', (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    const config = JSON.parse(data);
                    resolve(config);
                }
            });
        });
    }

    getConfigSync() {
        try {
            const data = fs.readFileSync(this.configPath, 'utf8');
            return JSON.parse(data);
        } catch (e) {
            if(typeof(e) != "string")
                e = JSON.stringify(e);

            console.error(`[ConfigManager] Error while getting config ${this.configPath} : ${e}`);
            return {}
        }
    }

    setConfig(config: string) {
        return new Promise((resolve, reject) => {
            fs.writeFile(this.configPath, JSON.stringify(config), 'utf8', (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(undefined);
                }
            });
        });
    }

    setConfigSync(config: string) {
        fs.writeFileSync(this.configPath, JSON.stringify(config), 'utf8');
    }
}