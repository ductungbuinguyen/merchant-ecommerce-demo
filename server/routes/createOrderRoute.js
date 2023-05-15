const express = require('express');
const https = require('https');
const crypto = require('crypto');
const { utils, Wallet, BigNumber } = require('ethers');
const { solidityPack, keccak256, arrayify, parseEther } = utils;
const router = express.Router();
const products = require('../data/productData');

const apiKey = process.env.API_KEY;
const secretKey = process.env.SECRET_KEY;
const signer = new Wallet(process.env.PRIVATE_KEY);

const generatePublicApiSignature = ({ body, secretKey }) => {
	const hmac = crypto.createHmac('sha256', secretKey);
	const data = hmac.update(body);
	const hexString = data.digest('hex');
	return hexString.toUpperCase();
};

const signOrder = async (signer, data) => {
	const { buyer, price, shipDeadline, nonce } = data;
	const message = solidityPack(
		['address', 'uint256', 'uint256', 'uint256'],
		[buyer, price, shipDeadline, nonce]
	);
	const messageHash = keccak256(message);
	const signature = await signer.signMessage(arrayify(messageHash));
	return signature;
};

// @route POST api/create_order
// @desc Create Order
// @access Public
router.post('/', async (req, apiRes) => {
	try {
		const { buyerEmail, name, price } = req.query;
		const body = {
			buyerEmail,
		};
		const generateSignatureGetInformation = generatePublicApiSignature({
			body: JSON.stringify(body),
			secretKey,
		});
		console.log(
			'generateSignatureGetInformation',
			generateSignatureGetInformation
		);
		https.get(
			`https://${
				process.env.BCPS_URI
			}/information_for_create_order_input?${new URLSearchParams(
				body
			).toString()}`,
			{
				headers: {
					'bcps-api-key': apiKey,
					'bcps-signature': generateSignatureGetInformation,
					'Content-Type': 'application/json',
				},
			},
			(res) => {
				res.setEncoding('utf8');
				res.on('data', async (chunk) => {
					const { buyerAddress, nonce, currentBlockTimestamp } =
						JSON.parse(chunk);
					const handledNonce = BigNumber.from(nonce);
					const handledPrice = parseEther(price);
					const handledShipDeadline = BigNumber.from(
						Number(currentBlockTimestamp) + 60 * 60 * 24
					);
					console.log(
						'handled',
						handledNonce,
						handledPrice,
						handledShipDeadline
					);
					const createOrderSignature = await signOrder(signer, {
						buyer: buyerAddress,
						price: handledPrice,
						shipDeadline: handledShipDeadline,
						nonce: handledNonce,
					});
					console.log('createOrderSignature', createOrderSignature);
					const requestBody = {
						buyer: buyerAddress,
						nonce: Number(handledNonce),
						price: Number(handledPrice),
						shipDeadline: Number(handledShipDeadline),
						name,
						signature: createOrderSignature,
					};
					console.log('requestBody', requestBody);
					const generateSignatureForCallApi = generatePublicApiSignature({
						body: JSON.stringify(requestBody),
						secretKey,
					});
					const req = https.request(
						{
							host: process.env.BCPS_URI,
							path: '/create_order',
							method: 'POST',
							port: 443,
							// port: 4000,
							headers: {
								'Content-Type': 'application/json',
								'bcps-api-key': apiKey,
								'bcps-signature': generateSignatureForCallApi,
							},
						},
						(res) => {
							console.log(`STATUS create_order: ${res.statusCode}`);
							res.on("data", (chunk) => {
								const { qrCode } = JSON.parse(chunk);
								return apiRes.json({
									qrCode,
								})
							})
						}
					);
					req.write(JSON.stringify(requestBody));
					req.end();
				});
				res.on('end', () => {
					console.log('No more data in response.');
				});
			}
		);
	} catch (error) {
		apiRes.status(500).send(error);
	}
});

module.exports = router;
