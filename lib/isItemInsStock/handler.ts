import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient();

export const handler = async ({
  itemId,
  quantity,
}: {
  itemId: string;
  quantity: number;
}): Promise<void> => {
  const tableName = process.env.TABLE_NAME;
  const { Item } = await client.send(
    new GetItemCommand({
      TableName: tableName,
      Key: {
        ProductID: { S: itemId },
      },
    })
  );
  const stock = Item?.stock.N;
  if (stock === undefined || +stock < quantity) {
    throw new Error("Item Not Found");
  }
};
