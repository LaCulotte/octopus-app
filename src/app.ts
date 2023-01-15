import WebSocket from "ws";
import { v4 } from "uuid";
import { ConfigManager } from "./configManager";

type ReturnValue = {
    resolve : (msg: any) => void,
    reject : (error: any) => void
};

export class OctopusApp {
    url: string;
    type: string = undefined;
    description: string = "";

    config: ConfigManager;

    websocket: WebSocket;
    connected: boolean = false;

    returnValues: Map<string, ReturnValue> = new Map();
    returnValuesTimeout = 5000;

    constructor(octopusUrl: string, configPath: string = "./config.json", configSchemaPath: string = "./config-schema.json") {
        this.url = octopusUrl;
        this.config = new ConfigManager(configPath, configSchemaPath);
    }

    connect() {
        if(this.connected) {
            console.warn(`[${this.logHeader}] App already connected, did not reconnect.`);
            return;
        }
            
        // Add a this.connecting attribute that prevents multiple connections => reset after init or after error

        if (this.type === undefined) {
            console.error(`[${this.logHeader}] Could not connect app : app's type was left undefined (${this.type}).`);
            return;
        }

        this.websocket = new WebSocket(this.url);
        this.websocket.onopen = this.onOpen.bind(this);
        this.websocket.onmessage = this.onMessage.bind(this);
        this.websocket.onclose = this.onClose.bind(this);
    }

    // ----- Callbacks -----

    onOpen(event: WebSocket.Event) {
        let initMessage = {
            "type": "init",
            "app": {
                "type": this.type,
                "desc": this.description
            }
        };

        this.websocket.send(JSON.stringify(initMessage));
    }

    onInit(message: any) {
        if (this.connected) {
            console.warn(`[${this.logHeader}] Received init message while already connected.`);
            return;
        }

        if(message.data.toUpperCase() == "OK") {
            this.connected = true;    
            console.log(`[${this.logHeader}] Connected to ${this.url}`);

            return true;
        } else {
            console.log(`[${this.logHeader}] Could not connect to ${this.url} : ${message.data}`);            

            return false;
        }
    }

    onMessage(msgEvent: WebSocket.MessageEvent) {
        try {
            console.log("New message : ");
            console.log(msgEvent.data.toString());
            let message = JSON.parse(msgEvent.data.toString());

            switch (message.type.toLowerCase()) {
                case "init":
                    this.onInit(message); 
                    break;

                case "core":
                    this.onCore(message);
                    break;

                case "direct":
                    this.onDirect(message);
                    break;

                case "broadcast":
                    this.onBroadcast(message);
                    break;
                
                default:
                    console.error(`[${this.logHeader}] Unknown message type received : ${message.type}`);
                    break;
            }
        } catch(e) {
            console.error(`[${this.logHeader}] Caught exception while processing incoming message : ${e}.`)
        }
    }

    // ----- Messages functions -----

    sendCore(content: any, hasReturnValue: boolean = false, id: string = undefined) : Promise<any> | undefined {
        return this.sendMessage({
                type: "core",
                id: id,
                content: content
            }, 
            hasReturnValue);
    }

    onCore(message: any) {
        return this.resolveReturnValue(message.id, message);
    }

    sendDirect(destinationId: string, content: any, hasReturnValue: boolean = false, id: string = undefined) : Promise<any> | undefined {
        return this.sendMessage({
                type: "direct",
                id: id,
                dst: destinationId,
                content: content
            }, 
            hasReturnValue);
    }

    onDirect(message: any) {
        if(this.resolveReturnValue(message.id, message))
            return true;

        if (!message.content || !message.content.type)
            return false;

        switch (message.content.type.toLowerCase()) {
            case "getconfigschema":
                try {
                    this.sendDirect(message.src, {
                        success: true,
                        configSchema: this.config.getConfigSchemaSync()
                    }, false, message.id);
                } catch (e) {
                    this.sendDirect(message.src, {
                        success: false,
                        reason: e.toString()
                    }, false, message.id);
                }
                return true;

            case "getconfig":
                try {
                    this.sendDirect(message.src, {
                        success: true,
                        config: this.config.getConfigSync()
                    }, false, message.id);
                } catch (e) {
                    this.sendDirect(message.src, {
                        success: false,
                        reason: e.toString()
                    }, false, message.id);
                }
                return true;
                break;

            case "setconfig": 
                // this.sendDirect(message.src, this.config.getConfigSync(), false, message.id);
                if(!message.content.config) {
                    console.error(`[${this.logHeader}] Got 'setConfig' message with no field 'config' in content.`);
                } else {
                    this.config.setConfigSync(message.content.config);
                }

                return true;
                break;

            default:
                break;
        }

        return false;

    }

    sendBroadcast(channel: string, content: any, id: string = undefined) {
        this.sendMessage({
                type: "broadcast",
                channel: channel, 
                id: id,
                content: content
            }, 
            false);
    }

    subscribeToBroadcast(channel: string) : Promise<any> | undefined {
        return this.sendCore({
                type: "subscribebroadcast",
                channel: channel
            },
            true);
    }

    onBroadcast(message: any) {
    }

    // ----- Util functions -----

    getAppList() {
        return this.sendCore({
            type: "getapplist"
        },
        true);
    }

    updateDescription(newDescription: string) {
        this.description = newDescription;
        
        if(this.connected)
            this.sendCore({
                type: "updatedescription",
                desc: newDescription
            },
            false);
    }

    // ----- Return value functions -----

    setReturnValuesTimeout(timeout: number) {
        this.returnValuesTimeout = timeout;
    }

    addReturnValue(id: string): Promise<any> {
        let p = new Promise((res, rej) => {
            this.returnValues.set(id, {resolve: res, reject: rej});
            setTimeout(() => {
                this.rejectReturnValue(id, "timeout");
            }, this.returnValuesTimeout)
        });

        return p;
    }

    resolveReturnValue(id: string, message: any) {
        if (this.returnValues.has(id)) {
            this.returnValues.get(id).resolve(message);
            this.returnValues.delete(id);

            return true;
        } else {
            return false;
        }
    }
    
    rejectReturnValue(id: string, error: any) {
        if (this.returnValues.has(id)) {
            this.returnValues.get(id).reject(error);
            this.returnValues.delete(id);
    
            return true;
        } else {
            return false;
        }        
    }

    newMessageId() {
        return v4();
    }

    sendMessage(message: any, hasReturnValue: boolean) {
        if(message.id == undefined) 
            message.id = this.newMessageId();
        
        if (hasReturnValue) {     
            let retValue = this.addReturnValue(message.id);
            try {
                this.send(message);
            } catch (exception) {
                this.rejectReturnValue(message.id, exception);
                throw exception;
            } finally {
                return retValue;
            }
        } else {
            this.send(message);
            // return new Promise((res, rej) => { res(undefined); });
            return undefined;
        }
    }

    send(data: any) {
        if (this.connected)
            this.websocket.send(JSON.stringify(data));
        else 
            console.error(`[${this.logHeader}] Could not send message : not connected (this.connected == false)`);
    }

    // ----- Stop functions ----
    
    onClose(event: WebSocket.CloseEvent) {
        console.log(`[${this.logHeader}] Connection closed (code: ${event.code}) : ${event.reason}.`);
        this.stop();
    }

    stop() {
        if(!this.connected)
            return;

        this.connected = false;
        this.websocket.close();
    }

    // ----- Utils -----

    get logHeader() {
        return `${this.type}`;
    }
}