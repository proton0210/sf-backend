import * as cdk from "aws-cdk-lib";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { Construct } from "constructs";
import * as path from "path";

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const ProductTable = new cdk.aws_dynamodb.Table(this, "ProductTable", {
      partitionKey: {
        name: "ProductID",
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const OrderTable = new cdk.aws_dynamodb.Table(this, "OrderTable", {
      partitionKey: {
        name: "OrderId",
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const UsersTable = new cdk.aws_dynamodb.Table(this, "UsersTable", {
      partitionKey: {
        name: "UserID",
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      tableName: "Users",
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const postConfirmation = new cdk.aws_lambda_nodejs.NodejsFunction(
      this,
      "PostConfirmationFunction",
      {
        entry: path.join(__dirname, "PostConfirmation", "handler.ts"),
        handler: "handler",
        environment: {
          TABLE_NAME: UsersTable.tableName,
        },
      }
    );

    UsersTable.grantWriteData(postConfirmation);

    const bucket = new cdk.aws_s3.Bucket(this, "ImageBucket", {
      cors: [
        {
          allowedMethods: [
            cdk.aws_s3.HttpMethods.DELETE,
            cdk.aws_s3.HttpMethods.GET,
            cdk.aws_s3.HttpMethods.PUT,
            cdk.aws_s3.HttpMethods.POST,
          ],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
        },
      ],
    });

    const uploadFileLambda = new cdk.aws_lambda_nodejs.NodejsFunction(
      this,
      "UploadFileFunction",
      {
        entry: path.join(__dirname, "UploadFile", "handler.ts"),
        handler: "handler",
        environment: {
          TABLE_NAME: ProductTable.tableName,
          BUCKET_NAME: bucket.bucketName,
        },
      }
    );

    ProductTable.grantReadWriteData(uploadFileLambda);
    bucket.grantPut(uploadFileLambda);
    bucket.grantPutAcl(uploadFileLambda);

    const userPool = new cdk.aws_cognito.UserPool(this, "UserPool", {
      passwordPolicy: {
        minLength: 8,
        requireLowercase: false,
        requireUppercase: false,
        requireDigits: false,
        requireSymbols: false,
      },
      signInAliases: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      customAttributes: {
        name: new cdk.aws_cognito.StringAttribute({
          minLen: 3,
          maxLen: 20,
        }),
      },
      lambdaTriggers: {
        postConfirmation: postConfirmation,
      },
    });

    const client = new cdk.aws_cognito.UserPoolClient(this, "UserPoolClient", {
      userPool: userPool,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
    });

    new cdk.CfnOutput(this, "USERPOOL ID", {
      value: userPool.userPoolId,
    });

    new cdk.CfnOutput(this, "CLIENT ID", {
      value: client.userPoolClientId,
    });
    const adminGroup = new cdk.aws_cognito.CfnUserPoolGroup(
      this,
      "AdminGroup",
      {
        userPoolId: userPool.userPoolId,
        groupName: "admin",
        description: "Admin User Group",
      }
    );

    const authorizer = new HttpUserPoolAuthorizer(
      "UserpoolAuthorizer",
      userPool,
      {
        userPoolClients: [client],
        identitySource: ["$request.header.Authorization"],
      }
    );
  }
}
