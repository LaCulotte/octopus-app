module.exports = {
    Socket: {},
    RemoteInfo: {},
    createSocket: () => { throw new Error("Cannot use dragm in web context"); }
};