import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { ulid } from "ulid";

const client = new DynamoDBClient({});

export const handler = async ({
  order,
}: {
  order: { itemId: string; quantity: number }[];
}): Promise<void> => {
  const tableName = process.env.TABLE_NAME;
  const id = ulid();

  await client.send(
    new PutItemCommand({
      TableName: tableName,
      Item: {
        OrderID: { S: id },
        order: {
          L: order.map(({ itemId, quantity }) => ({
            M: { itemId: { S: itemId }, quantity: { N: quantity.toString() } },
          })),
        },
      },
    })
  );
};
