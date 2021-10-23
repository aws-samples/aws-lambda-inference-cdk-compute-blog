# Important note about MlS3Stack
The model files are not included in the ./ml-images/s3/nlp-models/nlp1 directory due to the file sizes of the model. You will need to download four files and place them in this directory prior to running cdk deploy MlS3Stack. The model files which were used in the AWS Compute Blog were as follows:

- https://huggingface.co/distilbert-base-uncased-distilled-squad/resolve/main/pytorch_model.bin
- https://huggingface.co/distilbert-base-uncased-distilled-squad/resolve/main/config.json
- https://huggingface.co/distilbert-base-uncased-distilled-squad/resolve/main/tokenizer.json
- https://huggingface.co/distilbert-base-uncased-distilled-squad/resolve/main/tokenizer_config.json
