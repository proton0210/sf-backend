import * as cdk from "aws-cdk-lib";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
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

    const API = new cdk.aws_apigatewayv2.HttpApi(this, "API ", {
      apiName: "SFAPI",
      corsPreflight: {
        allowHeaders: ["*"],
        allowMethods: [
          cdk.aws_apigatewayv2.CorsHttpMethod.GET,
          cdk.aws_apigatewayv2.CorsHttpMethod.PUT,
          cdk.aws_apigatewayv2.CorsHttpMethod.POST,
          cdk.aws_apigatewayv2.CorsHttpMethod.DELETE,
          cdk.aws_apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: ["*"],
        maxAge: cdk.Duration.days(10),
      },
      defaultAuthorizer: new HttpUserPoolAuthorizer(
        "UserPoolAuthorizer",
        userPool
      ),
    });

    new cdk.CfnOutput(this, "API Gateway URL", {
      value: API.url ?? "Something went wrong",
    });

    const uploadFileRoute = new cdk.aws_apigatewayv2.HttpRoute(
      this,
      "uploadFileRoute",
      {
        httpApi: API,
        routeKey: cdk.aws_apigatewayv2.HttpRouteKey.with(
          "/uploadFile",
          cdk.aws_apigatewayv2.HttpMethod.POST
        ),
        integration: new HttpLambdaIntegration(
          "uploadFileLambdaIntegration",
          uploadFileLambda
        ),
        authorizer: authorizer,
      }
    );

    const isItemInStock = new cdk.aws_lambda_nodejs.NodejsFunction(
      this,
      "isItemInStock",
      {
        entry: path.join(__dirname, "isItemInsStock", "handler.ts"),
        handler: "handler",
        runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
        environment: {
          TABLE_NAME: ProductTable.tableName,
        },
      }
    );
    ProductTable.grantReadWriteData(isItemInStock);
    const updateItemStock = new cdk.aws_lambda_nodejs.NodejsFunction(
      this,
      "updateItemStock",
      {
        entry: path.join(__dirname, "updateItemStock", "handler.ts"),
        handler: "handler",
        runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
        environment: {
          TABLE_NAME: ProductTable.tableName,
        },
      }
    );
    ProductTable.grantReadWriteData(updateItemStock);

    const createOrder = new cdk.aws_lambda_nodejs.NodejsFunction(
      this,
      "createOrder",
      {
        entry: path.join(__dirname, "createOrder", "handler.ts"),
        handler: "handler",
        runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,

        environment: {
          TABLE_NAME: OrderTable.tableName,
        },
      }
    );

    OrderTable.grantReadWriteData(createOrder);

    const stepFunctionProxyLambda = new cdk.aws_lambda_nodejs.NodejsFunction(
      this,
      "StepFunctionsProxy",
      {
        entry: path.join(__dirname, "StepFunctionsProxy", "handler.ts"),
        handler: "handler",
        runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      }
    );

    const createOirderReourceRoute = new cdk.aws_apigatewayv2.HttpRoute(
      this,
      "CreateOrderResourceRoute",
      {
        httpApi: API,
        routeKey: cdk.aws_apigatewayv2.HttpRouteKey.with(
          "/createOrder",
          cdk.aws_apigatewayv2.HttpMethod.POST
        ),
        integration: new HttpLambdaIntegration(
          "CreateOrderIntegration",
          stepFunctionProxyLambda
        ),
        authorizer: authorizer,
      }
    );

    const isIteminStockMappedTask = new cdk.aws_stepfunctions.Map(
      this,
      "IsItemInStockMappedStock",
      {
        itemsPath: "$.order",
        resultPath: cdk.aws_stepfunctions.JsonPath.DISCARD,
      }
    ).itemProcessor(
      new cdk.aws_stepfunctions_tasks.LambdaInvoke(this, "isIteminStockTask", {
        lambdaFunction: isItemInStock,
        payloadResponseOnly: true,
      })
    );

    const updateItemStockMappedtask = new cdk.aws_stepfunctions.Map(
      this,
      "updateItemStockMappedTask",
      {
        itemsPath: "$.order",
        itemSelector: {
          "item.$": "$$.Map.Item.Value",
        },
      }
    ).itemProcessor(
      new cdk.aws_stepfunctions_tasks.LambdaInvoke(
        this,
        "updateItemInStockTask",
        {
          lambdaFunction: updateItemStock,
        }
      )
    );

    const createOrderTask = new cdk.aws_stepfunctions_tasks.LambdaInvoke(
      this,
      "CreateOrderTask",
      {
        lambdaFunction: createOrder,
      }
    );

    const parallelState = new cdk.aws_stepfunctions.Parallel(
      this,
      "parallelState",
      {}
    );
    parallelState.branch(updateItemStockMappedtask, createOrderTask);

    const chain = isIteminStockMappedTask.next(parallelState);
    const stateMachine = new cdk.aws_stepfunctions.StateMachine(
      this,
      "EcomStateMachine",
      {
        definitionBody:
          cdk.aws_stepfunctions.DefinitionBody.fromChainable(chain),
      }
    );
    stateMachine.grantStartExecution(stepFunctionProxyLambda);
    stepFunctionProxyLambda.addEnvironment(
      "STATE_MACHINE_ARN",
      stateMachine.stateMachineArn
    );
  }
}
