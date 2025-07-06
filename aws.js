import fs from "node:fs/promises";
import {
	S3Client,
	PutObjectCommand,
	ListObjectsV2Command,
	GetObjectCommand,
	DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

// CONSTANTS
const region = process.env.AWS_REGION;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const bucket = process.env.AWS_S3_BUCKET;
const options = { region, bucket };

if (accessKeyId && secretAccessKey) {
	options.credentials = {
		accessKeyId,
		secretAccessKey,
	};
}

const s3Client = new S3Client(options);

async function uploadToS3(Key, Body) {
	try {
		const putCommand = new PutObjectCommand({
			Key,
			Body,
			Bucket: bucket
		});
		await s3Client.send(putCommand);
		return console.log("Uploaded:", Key);
	} catch (err) {
		return console.log("Failed:", Key, err.message);
	}
}

async function downloadOlderFilesAndSave() {
	const dirToSave = `versions/prev`;
	if (!existsSync(dirToSave)) await fs.mkdir(dirToSave, { recursive: true });
	try {
		const listCommand = new ListObjectsV2Command({
			Bucket: bucket,
		});
		const list = await s3Client.send(listCommand);
		for (const item of list.Contents) {
			const getCommand = new GetObjectCommand({
				Key: item.Key,
				Bucket: bucket,
			});
			const obj = await s3Client.send(getCommand);
			const filePathArray = `${dirToSave}/${item.Key}`.split("/");
			const fileName = filePathArray.pop();
			const filePath = filePathArray.join("/");
			if (!existsSync(filePath)) await fs.mkdir(filePath, { recursive: true });
			await fs.writeFile(`${filePath}/${fileName}`, obj.Body);
		}
	} catch (err) {
		console.error(err);
	}
}

async function deleteOlderVersion() {
	try {
		const listCommand = new ListObjectsV2Command({
			Bucket: bucket,
		});
		const list = await s3Client.send(listCommand);
		const keys = list.Contents.map(obj => ({Key: obj.Key}))
		const deleteObjects = new DeleteObjectsCommand({
			Bucket: bucket,
			Delete: {
				Objects: keys
			}
		})
		await s3Client.send(deleteObjects)
		console.log("Older files deleted from bucket")
	} catch (err) {
		console.error(err);
	}
}

async function main(path = "dist") {
	try {
		await deleteOlderVersion()
		const filesAndDirs = await fs.readdir(path, {
			withFileTypes: true,
			recursive: true,
		});
		const files = filesAndDirs
			.filter((f) => f.isFile())
			.map((f) => `${f.parentPath}/${f.name}`);
		for (let file of files) {
			const buffer = await fs.readFile(file);
			await uploadToS3(file.replace(path, ""), buffer);
		}
	} catch (err) {
		console.error(err);
	}
}

main();
// downloadOlderFilesAndSave();
// todo: also download and save older files as verion from s3 and then upload new one

