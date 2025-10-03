"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PASSWORD_POLICY = exports.JWT_SECRET = void 0;
exports.validatePassword = validatePassword;
exports.hashPassword = hashPassword;
exports.comparePassword = comparePassword;
exports.hashPasswordSync = hashPasswordSync;
exports.comparePasswordSync = comparePasswordSync;
exports.generateToken = generateToken;
const jsonwebtoken_1 = require("jsonwebtoken");
const bcrypt_1 = require("bcrypt");
const crypto_1 = require("crypto");
// Generate a secure random secret if none provided
const generateSecureSecret = () => {
    return crypto_1.default.randomBytes(64).toString('hex');
};
exports.JWT_SECRET = process.env.JWT_SECRET || (() => {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET environment variable must be set in production');
    }
    console.warn('⚠️  Using generated JWT secret for development. Set JWT_SECRET environment variable.');
    return generateSecureSecret();
})();
exports.PASSWORD_POLICY = {
    minLength: 8,
    upper: /[A-Z]/,
    lower: /[a-z]/,
    number: /[0-9]/,
    symbol: /[^A-Za-z0-9]/
};
function validatePassword(password) {
    if (typeof password !== 'string')
        return false;
    if (password.length < exports.PASSWORD_POLICY.minLength)
        return false;
    // Check if at least 2 of the 4 character types are present
    let typeCount = 0;
    if (exports.PASSWORD_POLICY.upper.test(password))
        typeCount++;
    if (exports.PASSWORD_POLICY.lower.test(password))
        typeCount++;
    if (exports.PASSWORD_POLICY.number.test(password))
        typeCount++;
    if (exports.PASSWORD_POLICY.symbol.test(password))
        typeCount++;
    return typeCount >= 2;
}
// Use async operations to avoid blocking the event loop
async function hashPassword(password) {
    const saltRounds = process.env.NODE_ENV === 'production' ? 12 : 10;
    return bcrypt_1.default.hash(password, saltRounds);
}
async function comparePassword(password, hash) {
    return bcrypt_1.default.compare(password, hash);
}
// Keep sync versions for backward compatibility during migration
function hashPasswordSync(password) {
    return bcrypt_1.default.hashSync(password, 10);
}
function comparePasswordSync(password, hash) {
    return bcrypt_1.default.compareSync(password, hash);
}
function generateToken(user) {
    return jsonwebtoken_1.default.sign({
        id: user.id,
        username: user.username,
        role: user.role,
        familyId: user.familyId || null
    }, exports.JWT_SECRET, { expiresIn: '7d' });
}
