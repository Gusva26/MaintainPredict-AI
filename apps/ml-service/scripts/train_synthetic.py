from app.model import train_or_load, evaluate

if __name__ == "__main__":
    print("Training synthetic RandomForest model...")
    train_or_load()
    print("Evaluation results on holdout:")
    print(evaluate())
