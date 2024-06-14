import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { PostConfirmationConfirmSignUpTriggerEvent } from "aws-lambda";

const client = new DynamoDBClient();

exports.handler = async (
  event: PostConfirmationConfirmSignUpTriggerEvent
): Promise<PostConfirmationConfirmSignUpTriggerEvent> => {
  const tableName = process.env.TABLE_NAME;
  const date = new Date();
  const isoDate = date.toISOString();
  const params = {
    TableName: tableName,
    Item: marshall({
      UserID: event.request.userAttributes.sub,
      Email: event.request.userAttributes.email,
      Name: event.request.userAttributes.name,
      CreateAt: isoDate,
      __typename: "User",
    }),
  };

  try {
    await client.send(new PutItemCommand(params));
  } catch (error: any) {
    throw new Error("Error Creating the User");
  }
  return event;
};
