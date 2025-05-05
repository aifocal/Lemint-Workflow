const { customAlphabet } = require('nanoid');

const createUniqueId = (size=10) => {
    return customAlphabet('1234567890', size)()
}

const getCurrentDate = () => {
    return new Date().toISOString();
}

module.exports = {
    createUniqueId,
    getCurrentDate
}
