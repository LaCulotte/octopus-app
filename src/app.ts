import WebSocket from "ws";
import { v4 } from "uuid";
import { ConfigManager } from "./configManager";
import { createSocket, RemoteInfo, Socket } from "dgram";
import { logger } from "./logger";

export type ReturnValue = {
    resolve : (msg: any) => void,
    reject : (error: any) => void
};

export type Callback = (message: any) => any;

export class OctopusApp {
    url: string = undefined;
    type: string = undefined;
    description: string = "";

    configManager: ConfigManager;

    websocket: WebSocket;
    connected: boolean = false;

    returnValues: Map<string, ReturnValue> = new Map();
    returnValuesTimeout = 5000;

    coreCallback: Map<string, Callback> = new Map();
    directCallback: Map<string, Callback> = new Map();
    broadcastCallback: Map<string, Callback> = new Map();
    // pipelineCallback: Map<string, Callback> = new Map();

    autoConnect = false;
    // autoConnectTimeout = 24 * 60 * 60 * 1000 // One day
    autoConnecTimeoutId: NodeJS.Timeout = undefined;
    lastAutoConnectTimestamp = Date.now();

    udpSocket: Socket = undefined;
    udpPort: number = 3000;
    exploredServers: Map<string, number> = new Map();
    exploredServersTimeout = 30000;

    constructor(configPath: string = "./config.json", configSchemaPath: string = "./config-schema.json") {
        this.configManager = new ConfigManager(configPath, configSchemaPath);
        this.configManager.getConfig().then((config: any) => {
            if (config.description != undefined) 
                this.description = config.description;
        }).catch((err) => {
            // Error is already logged
        });

        this.configUpdated(this.configManager.getConfigSync());
    }

    updateConfig(config: any) {
        if(!config)
            return;

        this.configManager.setConfigSync(config);
        this.configUpdated(config);
    }

    configUpdated(config: any) {
        if(!config)
            return;
        
        if(config.broadcastPort && this.udpPort != config.broadcastPort) {
            this.udpPort = config.broadcastPort;

            this.closeUdpSocket();
            this.openUdpSocket();
        }

        if(config.autoConnect != undefined)
            this.autoConnect = config.autoConnect;
    }

    openUdpSocket() {
        // Do not open udp socket if already connected or if the dgram module is fake (for webapps) 
        if(!this.connected) {
            logger.info(`[${this.logHeader}] Opening udp socket to discover StreamOctopus servers.`);
            
            this.udpSocket = createSocket({type: 'udp4', reuseAddr: true});
            this.udpSocket.bind(this.udpPort);
            this.udpSocket.on('message', this.onUdpMessage.bind(this));

            if(this.autoConnecTimeoutId)
                clearTimeout(this.autoConnecTimeoutId);
            this.autoConnecTimeoutId = setTimeout(this.closeUdpSocket.bind(this), 24 * 60 * 60 * 1000);
        } else {
            logger.info("Did not open udp socket because the app is already connected");
        }
    }

    closeUdpSocket() {
        if (this.udpSocket) {
            this.udpSocket.close();
            this.udpSocket = undefined;
        }

        if(this.autoConnecTimeoutId) {
            clearTimeout(this.autoConnecTimeoutId);
            this.autoConnecTimeoutId = undefined;
        }
    }

    onUdpMessage(message: Buffer, remote: RemoteInfo) {
        try {
            let messageJson = JSON.parse(message.toString());
            if(messageJson.type == "OctopusServerBroadcast" && messageJson.content && messageJson.content.websocket) {
                let url = `ws://${remote.address}:${messageJson.content.websocket}`;

                let now = Date.now();
                let toDel: string[] = [];
                for (let server of this.exploredServers) {
                    let serverUrl = server[0]
                    if(now - this.exploredServers.get(serverUrl) > this.exploredServersTimeout)
                        toDel.push(serverUrl);
                }

                for (let server of toDel) 
                    this.exploredServers.delete(server)

                if (this.exploredServers.get(url)) {
                    logger.info(`Ignoring ${now - this.exploredServers.get(url)} > ${this.exploredServersTimeout}`);
                    return;
                }

                this.exploredServers.set(url, now);
                this.connect(url);
            }
        } catch(e) {
        }
    }

    connect(url: string) {
        if(this.connected) {
            logger.warn(`[${this.logHeader}] App already connected, did not reconnect.`);
            return;
        }

        // Add a this.connecting attribute that prevents multiple connections => reset after init or after error

        if (this.type === undefined) {
            logger.error(`[${this.logHeader}] Could not connect app : app's type was left undefined (${this.type}).`);
            return;
        }

        if(url == undefined) {
            this.openUdpSocket();
            this.autoConnect = true;
        } else {
            this.closeUdpSocket();
            
            this.url = url;
            this.websocket = new WebSocket(this.url);
            this.websocket.onopen = this.onOpen.bind(this);
            this.websocket.onmessage = this.onMessage.bind(this);
            this.websocket.onclose = this.onClose.bind(this);
            this.websocket.onerror = (err) => {logger.info(err)};
        }
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

        // Add return value to have a timeout on the init message if the server is taking too long to respond
        this.addReturnValue("init").then((message) => {
            this.onInit(message)
        }).catch((err) => {
            logger.info(`[${this.logHeader}] Could not connect to ${this.url} : ${err}`);            
            this.onInitFailed();
        });

        this.websocket.send(JSON.stringify(initMessage));
    }

    onInit(message: any) {
        if (this.connected) {
            logger.warn(`[${this.logHeader}] Received init message while already connected.`);
            return false;
        }

        if(message.data.toUpperCase() == "OK") {
            this.connected = true;    
            logger.info(`[${this.logHeader}] Connected to ${this.url}`);

            return true;
        } else {
            logger.info(`[${this.logHeader}] Could not connect to ${this.url} : ${message.data}`);            
            this.onInitFailed();

            return false;
        }
    }

    onInitFailed() {
        this.stop();

        if(this.autoConnect)
            this.openUdpSocket();
    }

    onMessage(msgEvent: WebSocket.MessageEvent) {
        try {
            logger.info(`New message : ${msgEvent.data.toString()}`);
            let message = JSON.parse(msgEvent.data.toString());

            switch (message.type.toLowerCase()) {
                case "init":
                    // this.onInit(message);
                    this.resolveReturnValue("init", message);
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
                    logger.error(`[${this.logHeader}] Unknown message type received : ${message.type}`);
                    break;
            }
        } catch(e) {
            logger.error(`[${this.logHeader}] Caught exception while processing incoming message : ${e}.`)
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

        if (!message.content || !message.content.request)
            return false;

        switch (message.content.request.toLowerCase()) {
            case "getconfigschema":
                try {
                    this.sendDirect(message.src, {
                        success: true,
                        configSchema: this.configManager.getConfigSchemaSync()
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
                        config: this.configManager.getConfigSync()
                    }, false, message.id);
                } catch (e) {
                    this.sendDirect(message.src, {
                        success: false,
                        reason: e.toString()
                    }, false, message.id);
                }
                return true;

            case "setconfig": 
                // this.sendDirect(message.src, this.config.getConfigSync(), false, message.id);
                if(!message.content.config) {
                    logger.error(`[${this.logHeader}] Got 'setConfig' message with no field 'config' in content.`);
                } else {
                    this.updateConfig(message.content.config);
                }

                return true;

            default:
                break;
        }

        if(this.directCallback.has(message.content.request)) {
            return this.directCallback.get(message.content.request)(message);
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
        if (this.broadcastCallback.has(message.channel)) {
            return this.broadcastCallback.get(message.channel)(message);
        }

        return false;
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
            logger.error(`[${this.logHeader}] Could not send message : not connected (this.connected == false)`);
    }

    // ----- Stop functions ----
    
    onClose(event: WebSocket.CloseEvent) {
        logger.info(`[${this.logHeader}] Connection closed (code: ${event.code}) : ${event.reason}.`);
        this.stop();

        if(this.autoConnect) {
            this.exploredServers = new Map();
            this.openUdpSocket();
        }
    }

    stop() {
        if(!this.connected)
            return;

        this.connected = false;
        this.websocket.close();
        this.closeUdpSocket();
    }

    // ----- Utils -----

    get logHeader() {
        return `${this.type}`;
    }
}
