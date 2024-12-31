import { logger } from "./logger";
import { OctopusApp } from "./app";
import { createInterface, Interface } from "readline/promises";

class CLIApp extends OctopusApp {
    type: string = "CLI";
    cli: Interface;

    constructor() {
        super();

        this.cli = createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    onInit(message: any) {
        let success = super.onInit(message);

        if(success)
            this.cliMain();

        return success;
    }

    async cliMain() {
        while (true) {
            console.log("1 - Subscribe to broadcast");
            console.log("2 - Send broadcast");
            console.log("3 - Send direct");
            let res = await this.cli.question("Enter a number : ").catch((err) => logger.error("Not a number"));

            let res_num = Number(res);
            if (res_num == 1) {
                await this.cliSubBroadcast();
            } else if (res_num == 2) {
                await this.cliSendBroadcast();
            } else if (res_num == 3) {
                await this.cliSendDirect();
            } else {
                logger.error("Invalid input ...");
            }
        }
    }

    async cliSubBroadcast() {
        logger.info("Chose : Subscribe to broadcast");

        let channel = await this.cli.question("Enter channel name : ");
        channel = channel.trim()

        await this.subscribeToBroadcast(channel)
           .then((msg) => { logger.info("subscribed to " + channel); })
           .catch((err) => { logger.error(`could not subscribe : ${err}`)});
    }

    async cliSendBroadcast() {
        logger.info("Chose : send to broadcast");

        let channel = await this.cli.question("Enter channel name : ");
        channel = channel.trim()

        let content = await this.cli.question("Enter content");
        try {
            content = JSON.parse(content);
        } catch(err) {
            logger.error("Not a valid json, sending as string");
        }

        this.sendBroadcast(channel, content);
    }

    async cliSendDirect() {
        logger.info("Chose : send direct message");

        let appList: Array<any> = (await this.getAppList()).content;
        
        let index = 0;
        for (let i of appList) {
            console.log(`${index + 1} - ${i.type} (${i.desc})`);
            index ++;
        }

        let dest = await this.cli.question("Choose destination : ");
        let dest_num = Number(dest) - 1;

        if (isNaN(dest_num)) {
            logger.error("Not a number ...");
            return;
        } else if (dest_num < 0 || dest_num >= appList.length) {
             logger.error("Out of range ...");
             return;
        }

        let content = await this.cli.question("Enter content");
        try {
            content = JSON.parse(content);
        } catch(err) {
            logger.error("Not a valid json, sending as string");
        }

        this.sendDirect(appList[dest_num].id, content);
    }

    onBroadcast(message: any): void {
        super.onBroadcast(message);

        switch(message.channel) {
            default:
                console.log(`Received message on broadcast ${message.channel}`)
                break;
        }
    }
}

//
let app = new CLIApp();
app.connect(undefined);

