import * as jwt from 'jsonwebtoken';

// TODO util promisify didnt work like this: const token = util.promisify(jwt.verify)
async function parseToken(token: string, secretOrPublicKey: jwt.Secret, options: jwt.VerifyOptions): Promise<void> {
    return new Promise((res, rej) => {
        jwt.verify(token, secretOrPublicKey, options, (err, decoded) => {
            if(err) rej(err);
            else if(decoded) {
                /*const payload = (decoded as jwt.Jwt).payload as jwt.JwtPayload
                const token: AppToken = {...payload, id: payload.id, role: payload.role, username: payload.username}
                res(token);*/
                res();
            }
        })
    })
}

async function getJWKx509Certificate(certsEndpoint = process.env["OPENID_CERTS_ENDPOINT"] ?? ""): Promise<string> {
    // TODO fetch still stability 1 in node
    // TODO think about caching certs
    const resp = await fetch(certsEndpoint);
    const keys = (await resp.json()) as Array<any>;
    console.log(JSON.stringify(keys), undefined, 4);
    const signatureKey = keys.find(val => val.use === "sig")
    return signatureKey.x5c[0]
}

export async function checkToken(rawToken: string, certificateGetter = getJWKx509Certificate) {
    const cert = await certificateGetter();
    await parseToken(rawToken, cert, {})
}