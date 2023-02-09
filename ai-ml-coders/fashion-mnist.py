import tensorflow as tf


class MyCallback(tf.keras.callbacks.Callback):
    def on_epoch_end(self, epoch, logs={}):
        if logs.get('accuracy') > 0.95:
            print("\nReached 95% accuracy so cancelling training!")
            self.model.stop_training = True


callbacks = MyCallback()

mnist = tf.keras.datasets.fashion_mnist
(training_images, training_labels), (test_images, test_labels) = mnist.load_data()

# 이미지는 0 ~ 255 사이값을 가진다. 이를 255로 나누면 결국 0 ~ 1 사이의 값을 가질 수 있게 된다. (normalization)
training_images = training_images / 255.0
test_images = test_images / 255.0

model = tf.keras.models.Sequential([
    tf.keras.layers.Flatten(input_shape=(28, 28)),  # 사실 이것은 layer가 아닌, 입력데이터 형태를 바꾸는 것 (2D -> 1D)
    tf.keras.layers.Dense(128, activation=tf.nn.relu),  # hidden layer
    tf.keras.layers.Dense(10, activation=tf.nn.softmax)  # output layer. 클래스가 10개 이므로 10개의 뉴런을 둔다.
])

model.compile(optimizer='adam',
              loss='sparse_categorical_crossentropy',
              metrics=['accuracy'])

model.fit(training_images, training_labels, epochs=50, callbacks=[callbacks])
# model.fit(training_images, training_labels, epochs=5)

# model.evaluate(test_images, test_labels)
