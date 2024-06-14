//npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner ulid

import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ulid } from "ulid";

const dynamoClient = new DynamoDBClient();
const s3Client = new S3Client();

export const handler = async (event: {
  body: string;
}): Promise<{
  statusCode: number;
  body: string;
  headers: unknown;
}> => {
  const id = ulid();
  const tableName = process.env.TABLE_NAME;
  const bucketName = process.env.BUCKET_NAME;

  if (tableName === undefined || bucketName === undefined) {
    throw new Error("Missing Environment Variable");
  }

  try {
    const firstParseBody = JSON.parse(event.body.trim());
    const parsedBody = JSON.parse(firstParseBody);

    const userId = parsedBody.userId;
    const fileName = parsedBody.fileName;
    const name = parsedBody.name;
    const quantity = parsedBody.quantity;
    if (
      userId === undefined ||
      fileName === undefined ||
      name === undefined ||
      quantity === undefined
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Missing fields",
        }),
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      };
    }

    await dynamoClient.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          ProductID: { S: id },
          Name: { S: name },
          stock: { N: quantity.toString() },
          createdBy: { S: userId },
          ImageName: { S: fileName },
        },
      })
    );

    const uploadUrl = await getSignedUrl(
      s3Client,
      new PutObjectCommand({
        Bucket: bucketName,
        Key: `${fileName}`,
      }),
      {
        expiresIn: 60,
      }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ uploadUrl }),
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "OPTIONS,POST,PUT",
      },
    };
  } catch (error: any) {
    console.error(error);
    throw new Error("Error Processing Request");
  }

  return {
    statusCode: 400,
    body: JSON.stringify({ message: "Invalid Request Body" }),
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  };
};
