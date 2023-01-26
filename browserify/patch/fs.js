module.exports = {
    readFile: async (path, encoding, callback) => {
        try {
            const config = localStorage.getItem(`octopus-config-${path}`);

            if(config == null)
                throw new Error(`No item octopus-config-${path} in localStorage`);

            callback(undefined, config);
        } catch(e) {
            callback(e, undefined);
        }
    },

    readFileSync: (path, encoding) => {
        const config = localStorage.getItem(`octopus-config-${path}`);
        if(config == null)
            throw new Error(`No item octopus-config-${path} in localStorage`);

        return config;
    },

    writeFile: async (path, content, encoding, callback) => {
        try {
            localStorage.setItem(`octopus-config-${path}`, content);
            callback(undefined);
        } catch(e) {
            callback(e);
        }
    },

    writeFileSync: (path, content, encoding) => {
        localStorage.setItem(`octopus-config-${path}`, content);
    },

    appendFile: async (path, content, encoding, callback) => {
        try {
            let toAppend = localStorage.getItem(`octopus-config-${path}`) || "";
            localStorage.setItem(`octopus-config-${path}`, toAppend + content);
            callback(undefined);
        } catch(e) {
            callback(e);
        }
    },

    appendFileSync: (path, content, encoding) => {
        let toAppend = localStorage.getItem(`octopus-config-${path}`) || "";
        localStorage.setItem(`octopus-config-${path}`, toAppend + content);
    }
}